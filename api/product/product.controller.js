var mongoose = require("mongoose");
var async = require("async");
var crypto = require("crypto");
var EmailTemplates = require("swig-email-templates");
var nodemailer = require("nodemailer");
var path = require("path");
var resCode = require("../../config/res_code_config");
var commonConfig = require("../../config/common_config");
var setRes = require("../../response");
var jwt = require("jsonwebtoken");
var models = require("../../models");
var bcrypt = require("bcrypt");
var _ = require("underscore");
var moment = require("moment");
const Sequelize = require("sequelize");
var notification = require("../../push_notification");
var awsConfig = require("../../config/aws_S3_config");
const fs = require("fs");
var multer = require("multer");
const multerS3 = require("multer-s3");
const { condition } = require("sequelize");
const pagination = require("../../helpers/pagination");
const response = require("../../response");
var mailConfig = require("../../config/mail_config");

exports.createInquiry = async (req, res) => {
	try {
		var data = req.body;
		var dbModel = models.product_inquiry;
		var businessModel = models.business;

		var requiredFields = _.reject(
			[
				"name",
				"email",
				"phone",
				"address",
				"latitude",
				"longitude",
				"user_id",
				"message",
				"type",
			],
			(o) => {
				return _.has(data, o);
			}
		);

		if (requiredFields == "") {
			// dbModel.findOne({where: {email: data.email, is_deleted: false}}).then((inquiry) => {
			// 	if (inquiry == null){
			dbModel
				.create(data)
				.then(async function (inquiry) {
					if (inquiry) {
						//send firebase notification to business user
						var NotificationData = {};
						var InquiryMessage = "Someone want to know about your products.";
						var BookingMessage = "Someone has requested for booking";

						await businessModel
							.findOne({
								where: {
									id: inquiry.business_id,
								},
							})
							.then((business) => {
								if (business != null && business.device_token != null) {
									NotificationData.device_token = business.device_token;

									inquiry.type == 1
										? (NotificationData.message = InquiryMessage)
										: (NotificationData.message = BookingMessage);

									NotificationData.content = {
										name: data.name,
										email: data.email,
										date: data.date,
										time: data.time,
									};
									notification.SendNotification(NotificationData);
								}
							});
						// send notification code over
						res.send(
							setRes(resCode.OK, true, "Inquiry created successfully.", inquiry)
						);
					} else {
						res.send(
							setRes(resCode.BadRequest, false, "Fail to create inquiry.", null)
						);
					}
				})
				.catch((error) => {
					res.send(
						setRes(resCode.InternalServer, false, "Internal server error.", null)
					);
				});
			// 	}
			// 	else{
			// 		res.send(setRes(resCode.BadRequest, null, true, 'Inquiry already created on this email'));
			// 	}
			// })
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.GetAllProducts = async (req, res) => {
	try {
		var productModel = models.products;
		var business = models.business;
		var category = models.business_categorys;
		var product_category = models.product_categorys;
		var productRattingModel = models.product_ratings;
		const discountsModel = models.discounts;
		const couponesModel = models.coupones;
		const cashbaksModel = models.cashbacks;
		const loyaltyPointModel = models.loyalty_points;
		var Op = models.Op;
		var categoryModel = models.product_categorys;
		var data = req.body;
		var requiredFields = _.reject(["page", "page_size", "business_id"], (o) => {
			return _.has(data, o);
		});

		if (requiredFields == "") {
			if (data.page && +data.page <= 0) {
				return res.send(
					setRes(
						resCode.BadRequest,
						false,
						"invalid page number, should start with 1",
						null
					)
				);
			}

			//if(data.page_size && +data.page_size <= 0) {
			//	return res.send(
			//		setRes(
			//			resCode.BadRequest,
			//			false,
			//			"invalid page number, should start with 1",
			//			null
			//		)
			//	);
			//}

			if (data.category_id && +data.category_id < 1) {
				return res.send(
					setRes(resCode.BadRequest, false, "Invalid Category id", null)
				);
			}

			var skip = data.page_size * (data.page - 1);
			var limit = parseInt(data.page_size);
			var condition = {
				order: [["name", "ASC"]],
				include: [
					{
						model: productRattingModel,
						attributes: [],
					},
					{
						model: categoryModel,
						as: "product_categorys",
						attributes: ["name", "is_deleted"],
						where: {
							is_deleted: false
						}
					},
					{
						model: categoryModel,
						as: "sub_category",
						attributes: ["name", "is_deleted"],
						//where: {
						//	is_deleted: false
						//}
					},
				],
				attributes: {
					include: [
						[
							Sequelize.fn("AVG", Sequelize.col("product_ratings.ratings")),
							"rating",
						],
					],
				},
			};
			const categoryCond =
				data.category_id && +data.category_id > 0
					? { category_id: data.category_id }
					: {};
			condition.where = {
				...categoryCond,
				...{ business_id: data.business_id, is_deleted: false },
			};
			condition.attributes = { exclude: ["createdAt", "updatedAt"] };
			if (!_.isEmpty(data.price)) {
				if (data.price == 1) {
					condition.order = Sequelize.literal("price DESC");
				} else {
					condition.order = Sequelize.literal("price ASC");
				}
			}

			if (data.search && data.search != null && !_.isEmpty(data.search)) {
				condition.where = {
					...condition.where,
					...{ [Op.or]: [{ name: { [Op.like]: "%" + data.search + "%" } }] },
				};
			}

			if (data.sub_category_id) {
				condition.where = {
					...condition.where,
					...{
						business_id: data.business_id,
						category_id: data.category_id,
						sub_category_id: data.sub_category_id,
					},
				};
			}

			if (data.page_size != 0 && !_.isEmpty(data.page_size)) {
				(condition.offset = skip), (condition.limit = limit);
			}
			const recordCount = await productModel.findAndCountAll(condition);
			const totalRecords = recordCount?.count;
			await productModel
				.findAll(condition)
				.then(async (products) => {
					if (products) {
						for (const data of products) {

							const rewards = [];
							const discounts = await discountsModel.findAll({
								attributes: {
									exclude: ["createdAt", "updatedAt", "deleted_at", "isDeleted"],
								},
								where: {
									product_id: {
										[Op.regexp]: `(^|,)${data.id}(,|$)`,
									},
									status: true,
									isDeleted: false,
								},
							});
							for (const data of discounts) {
								let discountString = "";
								if (data.discount_type == 0) {
									discountString += `${data.discount_value}% Discount`;
								} else {
									discountString += `$${data.discount_value} Discount`;
								}
								rewards.push({
									type: "discounts",
									title: discountString,
									id: data.id,
									business_id: data.business_id,
									discount_type: data.discount_type,
									discount_value: data.discount_value,
									product_category_id: data.product_category_id,
									product_id: data.product_id,
									validity_for: data.validity_for,
									status: data.status,
								});
							}

							const coupones = await couponesModel.findAll({
								attributes: ["id", "value_type", "coupon_value", "coupon_type"],
								where: {
									product_id: {
										[Op.regexp]: `(^|,)${data.id}(,|$)`,
									},
									status: true,
									isDeleted: false,
								},
							});
							for (const data of coupones) {
								let couponString = "";
								if (data.coupon_type == 1) {
									if (data.value_type == 1) {
										couponString += `${data.coupon_value}% Discount`;
									} else {
										couponString += `$${data.coupon_value} Discount`;
									}
									rewards.push({ type: "coupones", title: couponString });
								}
							}

							const cashbacks = await cashbaksModel.findAll({
								attributes: [
									"id",
									"cashback_value",
									"cashback_type",
									"cashback_on",
								],
								where: {
									product_id: {
										[Op.regexp]: `(^|,)${data.id}(,|$)`,
									},
									status: true,
									isDeleted: false,
								},
							});
							for (const data of cashbacks) {
								let discountString = "";
								if (data.cashback_on == 0) {
									if (data.cashback_type == 0) {
										discountString += `${data.cashback_value}% cashback`;
									} else {
										discountString += `$${data.cashback_value} cashback`;
									}
									rewards.push({ type: "cashbacks", title: discountString });
								}
							}

							const loyaltyPoints = await loyaltyPointModel.findAll({
								attributes: ["id", "loyalty_type", "points_earned"],
								where: {
									product_id: {
										[Op.regexp]: `(^|,)${data.id}(,|$)`,
									},
									status: true,
									isDeleted: false,
								},
							});
							for (const data of loyaltyPoints) {
								let loyaltyString = "";
								if (data.loyalty_type == 1) {
									loyaltyString += `Earn ${data.points_earned} points`;
									rewards.push({ type: "loyalty_points", title: loyaltyString });
								}
							}

							var product_images = data.image;

							var image_array = [];

							if (product_images != null) {
								for (const data of product_images) {
									const signurl = await awsConfig
										.getSignUrl(data)
										.then(function (res) {
											image_array.push(res);
										});
								}
							} else {
								image_array.push(commonConfig.default_image);
							}

							data.dataValues.product_images = image_array;
							if (data.product_categorys != null) {
								data.dataValues.category_name = data.product_categorys.name;
								delete data.dataValues.product_categorys;
							} else {
								data.dataValues.category_name = "";
							}
							if (data.sub_category != null) {
								data.dataValues.product_type = data.sub_category.name;
								delete data.dataValues.sub_category;
							} else {
								data.dataValues.product_type = "";
							}
							var isFree = false;

							var couponData = await couponesModel.findOne({
								where: {
									isDeleted: false,
									status: true,
									coupon_type: false,
									product_id: {
										[Op.regexp]: `(^|,)${data.id}(,|$)`,
									}
								}
							});
							if (!(_.isNull(couponData))) {
								isFree = true;
							}
							data.dataValues.is_free = isFree
							data.dataValues.rewards = rewards;
						}
						const response = new pagination(
							products,
							parseInt(totalRecords),
							parseInt(data.page),
							parseInt(data.page_size)
						);
						res.send(
							setRes(
								resCode.OK,
								true,
								"Get product list successfully",
								response.getPaginationInfo()
							)
						);
					}
				})
				.catch((error) => {
					res.send(setRes(resCode.InternalServer, false, error, null));
				});
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.GetBookingInquiry = async (req, res) => {
	try {
		var data = req.body;
		var businessModel = models.business;
		var calenderModel = models.product_inquiry;
		var Op = models.Op;

		var requiredFields = _.reject(["business"], (o) => {
			return _.has(data, o);
		});

		if (requiredFields == "") {
			businessModel
				.findOne({
					where: {
						id: data.business,
						is_active: 1,
						is_deleted: 0,
					},
				})
				.then((business) => {
					if (business != "") {
						calenderModel
							.findAll({
								where: {
									business_id: data.business,
									is_deleted: 0,
									date: {
										[Op.between]: [
											moment(new Date(data.from_date)).format("YYYY-MM-DD"),
											moment(new Date(data.to_date)).format("YYYY-MM-DD"),
										],
									},
								},
								order: [
									["date", "DESC"],
									["time", "DESC"],
								],
							})
							.then((bookings) => {
								if (bookings != "") {
									res.send(
										setRes(
											resCode.OK,
											true,
											"Available booking for your business.",
											bookings
										)
									);
								} else {
									res.send(
										setRes(
											resCode.OK,
											true,
											"No Booking available for your business.",
											bookings
										)
									);
								}
							})
							.catch((calenderError) => {
								res.send(
									setRes(
										resCode.InternalServer,
										false,
										"Internal server error.",
										null
									)
								);
							});
					} else {
						res.send(
							setRes(resCode.ResourceNotFound, false, "Business not found.", null)
						);
					}
				})
				.catch((error) => {
					res.send(
						setRes(resCode.InternalServer, false, "Internal server error.", null)
					);
				});
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.IsReadStatus = async (req, res) => {
	try {
		var data = req.body;
		var ProductInqModel = models.product_inquiry;

		var requiredFields = _.reject(["inquiry"], (o) => {
			return _.has(data, o);
		});

		if (requiredFields == "") {
			ProductInqModel.update(
				{
					is_read: 1,
				},
				{
					where: {
						id: data.inquiry,
						is_deleted: 0,
					},
				}
			)
				.then((inquiry) => {
					if (inquiry == 1) {
						ProductInqModel.findOne({
							where: {
								id: data.inquiry,
								is_deleted: 0,
							},
						})
							.then((UpdatedInquiry) => {
								if (UpdatedInquiry != "") {
									res.send(
										setRes(
											resCode.OK,
											true,
											"Product inquiry is readed..",
											UpdatedInquiry
										)
									);
								} else {
									res.send(
										setRes(
											resCode.BadRequest,
											false,
											"Fail to get inquiry.",
											null
										)
									);
								}
							})
							.catch((GetInquiryError) => {
								res.send(
									setRes(
										resCode.InternalServer,
										false,
										"Internal server error.",
										null
									)
								);
							});
					} else {
						res.send(
							setRes(resCode.BadRequest, false, "Fail to read inquiry.", null)
						);
					}
				})
				.catch((error) => {
					res.send(setRes(resCode.BadRequest, false, error, null));
				});
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.createProduct = async (req, res) => {
	try {
		var data = req.body;
		var filesData = req.files;
		var validation = true;
		var businessModel = models.business;
		var categoryModel = models.product_categorys;
		var productModel = models.products;
		var Op = models.Op;
		var requiredFields = _.reject(
			[
				"business_id",
				"category_id",
				"sub_category_id",
				"name",
				"price",
				"description",
				"product_item",
			],
			(o) => {
				return _.has(data, o);
			}
		);
		if (requiredFields == "") {
			if (data.name && !_.isEmpty == data.name) {
				var name = data.name;
				var validname = /^[A-Z+_.a-z+_.0-9 ]+$/;
				if (name.match(validname) == null) {
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"Please enter valid product name.",
							null
						)
					);
				}
			}

			if (data.name && !_.isEmpty(data.name)) {
				const condition = {};
				condition.where = {
					is_deleted: false,
					business_id: data.business_id,
					category_id: data.category_id,
					name: {
						[Op.eq]: data.name,
					},
				};
				if (data.sub_category_id) {
					condition.where = {
						...condition.where,
						...{ sub_category_id: data.sub_category_id },
					};
				}
				const existCategory = await productModel.findOne(condition);
				if (existCategory) {
					validation = false;
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"This product name already exists with this product category or sub-category!",
							null
						)
					);
				}
			}

			if (data.category_id) {
				await categoryModel
					.findOne({
						where: {
							id: data.category_id,
							is_enable: true,
							is_deleted: false,
							parent_id: {
								[Op.eq]: 0,
							},
						},
					})
					.then(async (productCategory) => {
						if (productCategory == null) {
							validation = false;
							return res.send(
								setRes(
									resCode.ResourceNotFound,
									false,
									"Product category not found.",
									null
								)
							);
						}
					});
			}

			if (data.price && !_.isEmpty(data.price)) {
				if (data.price <= 0) {
					validation = false;
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"Please enter price value more than 0.",
							null
						)
					);
				}
			}

			if (data.cost_price && !_.isEmpty(data.cost_price)) {
				if (data.cost_price <= 0) {
					validation = false;
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"Please enter cost price value more than 0.",
							null
						)
					);
				}
			}

			if (data.sub_category_id) {
				await categoryModel
					.findOne({
						where: {
							id: data.sub_category_id,
							is_enable: true,
							is_deleted: false,
							parent_id: {
								[Op.ne]: 0,
							},
						},
					})
					.then(async (productSubCategory) => {
						if (productSubCategory == null) {
							validation = false;
							return res.send(
								setRes(
									resCode.ResourceNotFound,
									false,
									"Product sub category not found.",
									null
								)
							);
						}
					});
			}

			if (filesData.length == 0) {
				res.send(
					setRes(
						resCode.BadRequest,
						false,
						"At least one image is required for product",
						null
					)
				);
				validation = false;
			} else if (filesData.length > 5) {
				validation = false;
				res.send(
					setRes(
						resCode.BadRequest,
						false,
						"You can upload only 5 images",
						null
					)
				);
			}
			if (filesData.length != 0 && filesData.length <= 5) {
				for (const image of filesData) {
					const fileContent = await fs.promises.readFile(image.path);
					const fileExt = `${image.originalname}`.split(".").pop();
					if (image.size > commonConfig.maxFileSize) {
						validation = false;
						res.send(
							setRes(
								resCode.BadRequest,
								false,
								"You can upload only 5 mb files, some file size is too large",
								null
							)
						);
					} else if (!commonConfig.allowedExtensions.includes(fileExt)) {
						// the file extension is not allowed
						validation = false;
						res.send(
							setRes(
								resCode.BadRequest,
								false,
								"You can upload only jpg, jpeg, png files",
								null
							)
						);
					}
				}
			}

			if (validation) {
				await businessModel
					.findOne({
						where: {
							id: data.business_id,
							is_deleted: false,
							is_active: true,
						},
					})
					.then(async (business) => {
						if (_.isEmpty(business)) {
							return res.send(
								setRes(
									resCode.ResourceNotFound,
									false,
									"Business not found.",
									null
								)
							);
						} else {
							await productModel
								.create(data)
								.then(async function (product) {
									const lastInsertId = product.id;
									if (lastInsertId) {
										var files = [];
										for (const file of filesData) {
											const fileContent = await fs.promises.readFile(file.path);
											const fileExt = `${file.originalname}`.split(".").pop();
											const randomString = Math.floor(Math.random() * 1000000);
											const fileName = `${Date.now()}_${randomString}.${fileExt}`;
											const params = {
												Bucket: awsConfig.Bucket,
												Key: `products/${lastInsertId}/${fileName}`,
												Body: fileContent,
											};

											const result = await awsConfig.s3
												.upload(params)
												.promise();
											if (result) {
												files.push(`products/${lastInsertId}/${fileName}`);
												fs.unlinkSync(file.path);
											}
										}
										var image = files.join(";");
										productModel
											.update(
												{
													image: image,
												},
												{
													where: {
														id: lastInsertId,
													},
												}
											)
											.then((productData) => {
												if (productData) {
													productModel
														.findOne({ where: { id: lastInsertId } })
														.then(async (getData) => {
															var product_images = getData.image;
															var image_array = [];
															for (const data of product_images) {
																const signurl = await awsConfig
																	.getSignUrl(data)
																	.then(function (res) {
																		image_array.push(res);
																	});
															}
															getData.dataValues.product_images = image_array;

															res.send(
																setRes(
																	resCode.OK,
																	true,
																	"Product added successfully",
																	getData
																)
															);
														});
												} else {
													res.send(
														setRes(
															resCode.BadRequest,
															false,
															"Image not update",
															getData
														)
													);
												}
											});
									}
								})
								.catch((error) => {
									res.send(
										setRes(
											resCode.BadRequest,
											false,
											"Fail to add product or service.",
											null
										)
									);
								});
						}
					});
			}
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null));
	}
};
exports.UpdateProductDetail = async (req, res) => {
	try {
		var data = req.body;

		var productModel = models.products;

		var options = {
			where: {
				is_deleted: false,
			},
		};

		const row = await productModel.findByPk(data.id, options);
		if (row == null) {
			return res.send(
				setRes(resCode.ResourceNotFound, false, "Product not found", null)
			);
		}
		const image = !_.isEmpty(row.image) && row.image != null ? row.image : 0;

		if (data.id) {
			if (data.name) {
				var name = data.name;
				var validname = /^[A-Z+_.a-z+_.0-9 ]+$/;
				if (name.match(validname) == null) {
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"Please enter valid product name.",
							null
						)
					);
				}
			}
			if (data.name && !_.isEmpty(data.name)) {
				var condition = {};
				condition.where = {
					is_deleted: false,
					name: {
						[models.Op.eq]: data.name,
					},
					id: {
						[models.Op.ne]: data.id,
					},
				};
				if (data.category_id) {
					condition.where = {
						...condition.where,
						...{ category_id: data.category_id },
					};
				}
				if (data.sub_category_id) {
					condition.where = {
						...condition.where,
						...{ sub_category_id: data.sub_category_id },
					};
				}
				const existCategory = await productModel.findOne(condition);
				if (existCategory) {
					validation = false;
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"This product name already exists with this product category or sub-category!",
							null
						)
					);
				}
			}

			if (data.price && !_.isEmpty(data.price)) {
				if (data.price <= 0) {
					validation = false;
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"Please enter price value more than 0.",
							null
						)
					);
				}
			}

			if (data.cost_price && !_.isEmpty(data.cost_price)) {
				if (data.cost_price <= 0) {
					validation = false;
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"Please enter cost price value more than 0.",
							null
						)
					);
				}
			}

			if (req.files) {
				const filesData = req.files;
				const total_image = image.length + filesData.length;
				var validation = true;

				if (total_image > 5) {
					validation = false;
					res.send(
						setRes(
							resCode.BadRequest,
							false,
							"You cannot update more than 5 images.You already uploaded " +
							image.length +
							" images",
							null
						)
					);
				}
				for (const imageFile of filesData) {
					const fileContent = await fs.promises.readFile(imageFile.path);
					const fileExt = `${imageFile.originalname}`.split(".").pop();
					if (imageFile.size > commonConfig.maxFileSize) {
						validation = false;
						res.send(
							setRes(
								resCode.BadRequest,
								false,
								"You can upload only 5 mb files, some file size is too large",
								null
							)
						);
					} else if (!commonConfig.allowedExtensions.includes(fileExt)) {
						// the file extension is not allowed
						validation = false;
						res.send(
							setRes(
								resCode.BadRequest,
								false,
								"You can upload only jpg, jpeg, png files",
								null
							)
						);
					}
				}
				if (validation) {
					var files = [];
					for (const file of filesData) {
						const fileContent = await fs.promises.readFile(file.path);
						const fileExt = `${file.originalname}`.split(".").pop();
						const randomString = Math.floor(Math.random() * 1000000);
						const fileName = `${Date.now()}_${randomString}.${fileExt}`;
						const params = {
							Bucket: awsConfig.Bucket,
							Key: `products/${data.id}/${fileName}`,
							Body: fileContent,
						};

						const result = await awsConfig.s3.upload(params).promise();
						if (result) {
							files.push(`products/${data.id}/${fileName}`);
							fs.unlinkSync(file.path);
						}
					}
					var images = files.join(";");
					const oldFilenames = image ? image.join(";") : "";

					if (images != "") {
						const allFilenames = `${oldFilenames};${images}`;
						data.image = allFilenames;
					}
				}
			}

			await productModel
				.update(data, {
					where: {
						id: data.id,
						is_deleted: false,
					},
				})
				.then(async (UpdatedProduct) => {
					if (UpdatedProduct == 1) {
						await productModel
							.findOne({
								where: {
									id: data.id,
									is_deleted: false,
								},
							})
							.then(async (UpdatedProduct) => {
								if (UpdatedProduct != null) {
									var product_images = UpdatedProduct.image;
									var image_array = [];
									if (product_images != null) {
										for (const data of product_images) {
											const signurl = await awsConfig
												.getSignUrl(data)
												.then(function (res) {
													image_array.push(res);
												});
										}
									} else {
										image_array.push(commonConfig.default_image);
									}
									UpdatedProduct.dataValues.product_images = image_array;
									res.send(
										setRes(
											resCode.OK,
											true,
											"Product updated successfully.",
											UpdatedProduct
										)
									);
								}
							})
							.catch((error) => {
								res.send(
									setRes(
										resCode.BadRequest,
										false,
										"Fail to updated product or service.",
										null
									)
								);
							})
							.catch((UpdateProductError) => {
								res.send(
									setRes(
										resCode.BadRequest,
										false,
										"Fail to updated product or service.",
										null
									)
								);
							});
					}
				})
				.catch((UpdateProductError) => {
					res.send(
						setRes(
							resCode.BadRequest,
							false,
							"Fail to updated product or service.",
							null
						)
					);
				});
		} else {
			res.send(setRes(resCode.BadRequest, false, "id is required", null));
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

// exports.ChatInitialize = async (req, res) => {
// 	var data = req.body
// 	var ProductInqModel = models.product_inquiry

// 	var requiredFields = _.reject(['inquiry'], (o) => { return _.has(data, o)  })

// 		if (requiredFields == ''){

// 			ProductInqModel.update({
// 				chat_init: 1
// 			},{
// 				where: {
// 					id: data.inquiry,
// 					is_deleted: 0
// 				}
// 			}).then(inquiry => {
// 				if (inquiry == 1){
// 					ProductInqModel.findOne({
// 						where: {
// 							id: data.inquiry,
// 							is_deleted: 0
// 						}
// 					}).then(UpdatedInquiry => {
// 						if (UpdatedInquiry != ''){
// 							res.send(setRes(resCode.OK, UpdatedInquiry , false, "Chat Initialize Successfully.."))
// 						}
// 						else{
// 							res.send(setRes(resCode.InternalServer, null, true, "Fail to get inquiry."))
// 						}
// 					}).catch(GetInquiryError => {
// 						res.send(setRes(resCode.BadRequest, null, true, GetInquiryError))
// 					})

// 				}else{
// 					res.send(setRes(resCode.InternalServer, null, true, "Fail to initialize chat."))
// 				}
// 			}).catch(error => {
// 				res.send(setRes(resCode.BadRequest, null, true, error))
// 			})

// 		}else{
// 			res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
// 		}
// }

exports.GetProductById = async (req, res) => {
	try {
		var data = req.params;
		var productModel = models.products;
		var productRattingModel = models.product_ratings;
		var categoryModel = models.product_categorys;
		var shoppingCartModel = models.shopping_cart;
		var wishlistModel = models.wishlists;
		var couponModel = models.coupones;
		const userModel = models.user;
		const userCouponModel = models.user_coupons;
		var Op = models.Op;

		var auth = req.user;
		var auth_id = "";
		if (auth.role_id == 2) {
			auth_id = auth.id;
		}
		const userDetails = await userModel.findOne({
			where: { email: auth?.user, is_deleted: false, is_active: true },
		});
		const userId = userDetails?.id || "";
		const total_loyalty_points = userDetails?.total_loyalty_points
			? userDetails?.total_loyalty_points
			: 0;
		const total_cashbacks = userDetails?.total_cashbacks
			? userDetails?.total_cashbacks
			: 0;
		await productModel
			.findOne({
				where: {
					id: data.id,
					is_deleted: false,
				},
				include: [
					{
						model: productRattingModel,
						attributes: [],
					},
					{
						model: categoryModel,
						as: "product_categorys",
						attributes: ["name"],
					},
					{
						model: categoryModel,
						as: "sub_category",
						attributes: ["name"],
					},
				],
				attributes: {
					include: [
						[
							Sequelize.fn("AVG", Sequelize.col("product_ratings.ratings")),
							"rating",
						],
					],
				},
			})
			.then(async (product) => {
				if (product && product.id != null) {
					var isFav = false;
					var isAddCart = false;
					await shoppingCartModel
						.findOne({
							where: {
								product_id: product.id,
								business_id: product.business_id,
								is_deleted: false,
								user_id: auth_id,
							},
						})
						.then(async (cart) => {
							if (cart) {
								isAddCart = true;
							}
						});
					await wishlistModel
						.findOne({
							where: {
								product_id: product.id,
								is_deleted: false,
								user_id: auth_id,
							},
						})
						.then(async (fav) => {
							if (fav) {
								isFav = true;
							}
						});
					var rewards = [];
					const cashbaksModel = models.cashbacks;
					var discountsModel = models.discounts;
					const loyaltyPointModel = models.loyalty_points;
					const discounts = await discountsModel.findAll({
						attributes: {
							exclude: ["createdAt", "updatedAt", "deleted_at", "isDeleted"],
						},
						where: {
							product_id: {
								[Op.regexp]: `(^|,)${data.id}(,|$)`,
							},
							status: true,
							isDeleted: false,
						},
					});
					for (const data of discounts) {
						let discountString = "";
						if (data.discount_type == 0) {
							discountString += `${data.discount_value}% Discount`;
						} else {
							discountString += `$${data.discount_value} Discount`;
						}
						rewards.push({
							type: "discounts",
							title: discountString,
							id: data.id,
							business_id: data.business_id,
							discount_type: data.discount_type,
							discount_value: data.discount_value,
							product_category_id: data.product_category_id,
							product_id: data.product_id,
							validity_for: data.validity_for,
							status: data.status,
						});
					}

					const coupones = await couponModel.findAll({
						attributes: ["id", "value_type", "coupon_value", "coupon_type"],
						where: {
							product_id: {
								[Op.regexp]: `(^|,)${data.id}(,|$)`,
							},
							status: true,
							isDeleted: false,
						},
					});
					for (const data of coupones) {
						let couponString = "";
						if (data.coupon_type == 1) {
							if (data.value_type == 1) {
								couponString += `${data.coupon_value}% Discount`;
							} else {
								couponString += `$${data.coupon_value} Discount`;
							}
							rewards.push({ type: "coupones", title: couponString });
						}
					}

					const cashbacks = await cashbaksModel.findAll({
						attributes: ["id", "cashback_value", "cashback_type", "cashback_on"],
						where: {
							product_id: {
								[Op.regexp]: `(^|,)${data.id}(,|$)`,
							},
							status: true,
							isDeleted: false,
						},
					});
					for (const data of cashbacks) {
						let discountString = "";
						if (data.cashback_on == 0) {
							if (data.cashback_type == 0) {
								discountString += `${data.cashback_value}% cashback`;
							} else {
								discountString += `$${data.cashback_value} cashback`;
							}
							rewards.push({ type: "cashbacks", title: discountString });
						}
					}

					const loyaltyPoints = await loyaltyPointModel.findAll({
						attributes: ["id", "loyalty_type", "points_earned"],
						where: {
							product_id: {
								[Op.regexp]: `(^|,)${data.id}(,|$)`,
							},
							status: true,
							isDeleted: false,
						},
					});
					for (const data of loyaltyPoints) {
						let loyaltyString = "";
						if (data.loyalty_type == 1) {
							loyaltyString += `Earn ${data.points_earned} points`;
							rewards.push({
								type: "loyalty_points",
								title: loyaltyString,
								loyalty_id: data.id,
							});
						}
					}
					const reviews = await productRattingModel.findAll({
						where: {
							product_id: data.id,
							is_deleted: false,
						},
						include: [
							{
								model: userModel,
								where: {
									is_active: true,
								},
								attributes: ['username', 'profile_picture']
							}
						],
						attributes: ['ratings', 'description', 'is_review_report', 'report_description']
					});
					for (const data of reviews) {
						if (data.user.profile_picture != null) {
							var profile_picture = await awsConfig
								.getSignUrl(data.user.profile_picture)
								.then(function (res) {
									data.dataValues.profile_picture = res;
								});
						} else {
							data.dataValues.profile_picture =
								commonConfig.default_user_image;
						}
						data.dataValues.username = data.user.username
						delete data.dataValues.user
					}

					const couponData = await couponModel.findOne({
						where: {
							isDeleted: false,
							status: true,
							product_id: {
								[Op.regexp]: `(^|,)${product.id}(,|$)`,
							},
							business_id: product.business_id,
						},
					});
					var is_coupon_available = false;

					if (!_.isEmpty(couponData)) {
						const productIds = couponData.product_id; // Retrieve the hobbies column value from the data object
						const ids = productIds?.split(",")?.includes(`${product.id}`);
						if (ids || couponsAvailableData) {
							is_coupon_available = true;
						}
					}
					var product_images = product.image;
					var image_array = [];
					if (product_images != null) {
						for (const data of product_images) {
							const signurl = await awsConfig
								.getSignUrl(data)
								.then(function (res) {
									image_array.push(res);
								});
						}
					} else {
						image_array.push(commonConfig.default_image);
					}
					product.dataValues.product_images = image_array;
					if (product.product_categorys != null) {
						product.dataValues.category_name = product.product_categorys.name;
						delete product.dataValues.product_categorys;
					} else {
						product.dataValues.category_name = "";
					}
					if (product.sub_category != null) {
						product.dataValues.product_type = product.sub_category.name;
						delete product.dataValues.sub_category;
					} else {
						product.dataValues.product_type = "";
					}
					product.dataValues.is_fav = isFav;
					product.dataValues.is_added_cart = isAddCart;
					product.dataValues.is_coupon_available = is_coupon_available;

					product.dataValues.applied_coupon_details = null;
					const couponDetails = await userCouponModel.findOne({
						where: {
							product_id: data.id,
							user_id: userId,
							is_deleted: false,
						},
						include: [
							{
								model: couponModel,
								attributes: [
									"id",
									"business_id",
									"title",
									"coupon_code",
									"coupon_type",
									"product_category_id",
									"product_id",
									"value_type",
									"coupon_value",
									"validity_for",
									"expire_at",
									"description",
								],
							},
						],
					});
					if (couponDetails) {
						let discountObj = {
							discountValue: 0,
							user_coupon_id: couponDetails.id,
							coupon_id: couponDetails.coupon_id,
							coupon_code: couponDetails?.coupone?.coupon_code,
							value_type: couponDetails?.coupone?.value_type,
							coupon: couponDetails?.coupone,
						};
						// If coupon is free product type
						if (couponDetails?.coupone?.coupon_type === false) {
							discountObj.discountValue = product?.dataValues?.price;
						} // If coupon is Discount coupon
						else {
							if (couponDetails?.coupone?.value_type === true) {
								// flat amount discount
								if (
									couponDetails?.coupone?.coupon_value >
									product?.dataValues?.price
								) {
									discountObj.discountValue = product?.dataValues?.price;
								} else {
									discountObj.discountValue = Number(
										couponDetails?.coupone?.coupon_value || 0
									);
								}
							} else {
								// percentage discount calculation
								const discount = Math.ceil(
									((product?.dataValues?.price || 0) *
										(couponDetails?.coupone?.coupon_value || 0)) /
									100
								);
								discountObj.discountValue = discount;
							}
						}
						product.dataValues.applied_coupon_details = discountObj;
					}
					product.dataValues.rewards = rewards;
					product.dataValues.reviews = reviews;
					product.dataValues.total_reviews = reviews.length
					product.dataValues.total_loyalty_points = total_loyalty_points;
					product.dataValues.total_cashbacks = total_cashbacks;
					res.send(
						setRes(resCode.OK, true, "Get product detail successfully.", product)
					);
				} else {
					res.send(
						setRes(resCode.ResourceNotFound, false, "Product not found.", null)
					);
				}
			})
			.catch((GetProductError) => {
				console.log(GetProductError);
				res.send(
					setRes(resCode.InternalServer, false, "Internal server error.", null)
				);
			});
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.RemoveProductImage = async (req, res) => {
	try {
		var data = req.body;
		var productModel = models.products;

		var requiredFields = _.reject(["id", "image_name"], (o) => {
			return _.has(data, o);
		});
		if (requiredFields == "") {
			if (data.image_name) {
				await productModel
					.findOne({
						where: {
							id: data.id,
							is_deleted: false,
						},
					})
					.then(async (productData) => {
						if (productData) {
							var replaceImages = await _.filter(productData.image, (img) => {
								var typeArr = data.image_name;
								if (!typeArr.includes(img)) {
									return img;
								}
								return "";
							});
							var new_images = replaceImages.join(";");
							var productremoveimages = data.image_name;
							for (const data of productremoveimages) {
								const params = {
									Bucket: awsConfig.Bucket,
									Key: data,
								};
								awsConfig.deleteImageAWS(params);
							}

							await productModel
								.update(
									{
										image: new_images,
									},
									{
										where: {
											id: data.id,
										},
									}
								)
								.then(async (updatedProduct) => {
									if (updatedProduct > 0) {
										productModel
											.findOne({
												where: {
													id: data.id,
												},
											})
											.then(async (product) => {
												var product_images = product.image;
												var image_array = [];
												for (const data of product_images) {
													const signurl = await awsConfig
														.getSignUrl(data)
														.then(function (res) {
															image_array.push(res);
														});
												}
												product.dataValues.product_images = image_array;
												res.send(
													setRes(
														resCode.OK,
														true,
														"Image remove successfully",
														product
													)
												);
											});
									}
								})
								.catch((error) => {
									res.send(
										setRes(
											resCode.InternalServer,
											false,
											"Internal server error.",
											null
										)
									);
								});
						} else {
							res.send(
								setRes(
									resCode.ResourceNotFound,
									false,
									"Product not found.",
									null
								)
							);
						}
					})
					.catch((error) => {
						res.send(
							setRes(
								resCode.BadRequest,
								false,
								"Fail to remove image from product.",
								null
							)
						);
					});
			} else {
				res.send(
					setRes(resCode.BadRequest, false, "Invalid image name...", null)
				);
			}
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};
exports.CreateCategory = async (req, res) => {
	try {
		var data = req.body;
		req.file ? (data.image = `${req.file.key}`) : "";
		var productCategoryModel = models.product_categorys;
		var businessModel = models.business;
		var validation = true;

		var requiredFields = _.reject(
			["business_id", "name", "image", "parent_id"],
			(o) => {
				return _.has(data, o);
			}
		);

		if (requiredFields == "") {
			var name = data.name;
			var validname = /^[A-Z+_.a-z+_.0-9 ]+$/;
			if (name.match(validname) == null) {
				if (data.parent_id == 0) {
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"Please enter valid product category name.",
							null
						)
					);
				} else {
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"Please enter valid Product sub category name.",
							null
						)
					);
				}
			}

			await businessModel
				.findOne({
					where: {
						id: data.business_id,
						is_deleted: false,
						is_active: true,
					},
				})
				.then(async (business) => {
					if (_.isEmpty(business)) {
						return res.send(
							setRes(resCode.ResourceNotFound, false, "Business not found.", null)
						);
					} else {
						if (data.parent_id != 0 && !_.isEmpty(data.parent_id)) {
							const parentCategory = await productCategoryModel.findOne({
								where: {
									id: data.parent_id,
									is_deleted: false,
								},
							});
							if (parentCategory.type == 'admin') {
								validation = false;
								return res.send(
									setRes(
										resCode.BadRequest,
										false,
										"You Can't create sub category in this parent category because it's admin's pre-defined main category!",
										null
									)
								);
							}
							if (!parentCategory) {
								validation = false;
								return res.send(
									setRes(
										resCode.BadRequest,
										false,
										"Product parent category not found!",
										null
									)
								);
							}
						}

						if (data.parent_id == 0 && !_.isEmpty(data.parent_id)) {
							const existCategory = await productCategoryModel.findOne({
								where: {
									is_deleted: false,
									business_id: data.business_id,
									parent_id: {
										[models.Op.eq]: 0,
									},
									name: {
										[models.Op.eq]: data.name,
									},
								},
							});
							if (existCategory) {
								validation = false;
								return res.send(
									setRes(
										resCode.BadRequest,
										false,
										"This product category name is already exists with this business!",
										null
									)
								);
							}
						}

						if (data.parent_id != 0 && !_.isEmpty(data.parent_id)) {
							const existSubCategory = await productCategoryModel.findOne({
								where: {
									is_deleted: false,
									parent_id: data.parent_id,
									business_id: data.business_id,
									parent_id: {
										[models.Op.ne]: 0,
									},
									name: {
										[models.Op.eq]: data.name,
									},
								},
							});
							if (existSubCategory) {
								validation = false;
								return res.send(
									setRes(
										resCode.BadRequest,
										false,
										"This Product sub category name is already exists with this category!",
										null
									)
								);
							}
						}

						if (validation) {
							data.type = "business";
							await productCategoryModel
								.create(data)
								.then(async (categoryData) => {
									if (categoryData) {
										if (data.image != null) {
											var image = await awsConfig
												.getSignUrl(data.image)
												.then(function (res) {
													data.image = res;
												});
										} else {
											data.image = commonConfig.default_image;
										}
										if (categoryData.parent_id == 0) {
											return res.send(
												setRes(
													resCode.OK,
													true,
													"Product category added successfully",
													data
												)
											);
										} else {
											return res.send(
												setRes(
													resCode.OK,
													true,
													"Product sub category added successfully",
													data
												)
											);
										}
									} else {
										res.send(
											setRes(
												resCode.InternalServer,
												false,
												"Internal server error",
												null
											)
										);
									}
								});
						}
					}
				});
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.CategoryList = async (req, res) => {
	try {
		var data = req.body;

		var productCategoryModel = models.product_categorys;
		const Op = models.Op;

		var requiredFields = _.reject(["page", "page_size"], (o) => {
			return _.has(data, o);
		});
		if (requiredFields == "") {
			if (data.page < 0 || data.page === 0) {
				res.send(
					setRes(
						resCode.BadRequest,
						false,
						"invalid page number, should start with 1",
						null
					)
				);
			}
			var skip = data.page_size * (data.page - 1);
			var limit = parseInt(data.page_size);
			var searchPattern = data?.search ? "%" + data.search + "%" : null;
			var business_id = data.business_id ? data.business_id : null;

			var query = `
			SELECT c.*,
			(SELECT COUNT(*) FROM product_categorys pcs
			 WHERE pcs.is_deleted = false
			 AND pcs.is_enable = true
			 AND pcs.parent_id = 0
			 AND (
			   (pcs.type = 'admin' ${searchPattern ? `AND pcs.name LIKE :searchPattern` : ""})
			   OR
			   (pcs.type = 'business' ${searchPattern ? `AND pcs.name LIKE :searchPattern` : ""} AND pcs.business_id = :business_id)
			 )`;
			if (data.is_add == true) {
				query += ` AND pcs.type = 'business'`;
			}
			query += `) AS total_count
		  FROM product_categorys c
		  WHERE c.is_deleted = false
		  AND c.is_enable = true
		  AND c.parent_id = 0
		  AND (
			(c.type = 'admin' ${searchPattern ? `AND c.name LIKE :searchPattern` : ""})
			OR
			(c.type = 'business' ${searchPattern ? `AND c.name LIKE :searchPattern` : ""} AND c.business_id = :business_id)
		  )`;

			if (data.is_add == true) {
				query += ` AND c.type = 'business'`;
			}

			query += ` ORDER BY c.name ASC`;
			// Check if pagination is requested
			if (data.page_size != 0 && !_.isEmpty(data.page_size)) {
				query += ` LIMIT ${limit} OFFSET ${skip}`;
			}

			var allCategorys = await models.sequelize.query(query, {
				replacements: {
					searchPattern: searchPattern,
					business_id: business_id,
				},
				type: Sequelize.QueryTypes.SELECT,
			});
			for (const data of allCategorys) {
				if (data.image != null) {
					const signurl = await awsConfig
						.getSignUrl(data.image)
						.then(function (res) {
							data.image = res;
						});
				} else {
					data.image = commonConfig.default_image;
				}
			}

			const updatedResponse = allCategorys.map(obj => {
				obj.is_editable_deletable = obj.type == 'admin' ? false : true;
				return obj;
			});

			const totalRecords = updatedResponse[0].total_count;
			const response = new pagination(
				updatedResponse,
				totalRecords,
				parseInt(data.page),
				parseInt(data.page_size)
			);
			res.send(
				setRes(
					resCode.OK,
					true,
					"Get category detail successfully.",
					response.getPaginationInfo()
				)
			);
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		console.log(error)
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.GetCategoryById = async (req, res) => {
	try {
		var data = req.params;
		var productCategoryModel = models.product_categorys;

		await productCategoryModel
			.findOne({
				where: {
					id: data.id,
					is_deleted: false,
					is_enable: true,
				},
			})
			.then(async (categoryData) => {
				if (categoryData != null) {
					if (categoryData.image != null) {
						var categoryData_image = await awsConfig
							.getSignUrl(categoryData.image)
							.then(function (res) {
								categoryData.image = res;
							});
					} else {
						categoryData.image = commonConfig.default_image;
					}
					res.send(
						setRes(
							resCode.OK,
							true,
							"Get category detail successfully.",
							categoryData
						)
					);
				} else {
					res.send(
						setRes(resCode.ResourceNotFound, false, "Category not found.", null)
					);
				}
			})
			.catch((GetCategoryError) => {
				res.send(
					setRes(resCode.InternalServer, false, "Internal server error.", null)
				);
			});
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.UpdateCategory = async (req, res) => {
	try {
		var data = req.body;
		req.file ? (data.image = `${req.file.key}`) : "";
		var productCategoryModel = models.product_categorys;
		var requiredFields = _.reject(["id", "business_id"], (o) => {
			return _.has(data, o);
		});
		if (requiredFields == "") {
			if (!_.isEmpty(data.name)) {
				var name = data.name;
				var validname = /^[A-Z+_.a-z+_.0-9 ]+$/;
				if (name.match(validname) == null) {
					if (data.parent_id == 0) {
						return res.send(
							setRes(
								resCode.BadRequest,
								false,
								"Please enter valid product category name.",
								null
							)
						);
					} else {
						return res.send(
							setRes(
								resCode.BadRequest,
								false,
								"Please enter valid Product sub category name.",
								null
							)
						);
					}
				}
			}
			if (data.parent_id != 0 && !_.isEmpty(data.parent_id)) {
				const parentCategory = await productCategoryModel.findOne({
					where: {
						id: {
							[models.Op.eq]: data.parent_id,
							[models.Op.ne]: data.id,
						},
						is_deleted: false,
					},
				});
				if (parentCategory && parentCategory.type == 'admin') {
					validation = false;
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"You Can't create sub category in this parent category because it's admin's pre-defined main category!",
							null
						)
					);
				}
				if (!parentCategory) {
					validation = false;
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"Product parent category not found!",
							null
						)
					);
				}
			}

			if (data.parent_id == 0 && !_.isEmpty(data.parent_id)) {
				const existCategory = await productCategoryModel.findOne({
					where: {
						is_deleted: false,
						business_id: data.business_id,
						parent_id: {
							[models.Op.eq]: 0,
						},
						id: {
							[models.Op.ne]: data.id,
						},
						name: {
							[models.Op.eq]: data.name,
						},
					},
				});
				if (existCategory) {
					validation = false;
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"This product category name is already exists with this business!",
							null
						)
					);
				}
			}

			if (data.parent_id != 0 && !_.isEmpty(data.parent_id)) {
				const existSubCategory = await productCategoryModel.findOne({
					where: {
						is_deleted: false,
						business_id: data.business_id,
						parent_id: {
							[models.Op.ne]: 0,
						},
						parent_id: data.parent_id,
						id: {
							[models.Op.ne]: data.id,
						},
						name: {
							[models.Op.eq]: data.name,
						},
					},
				});
				if (existSubCategory) {
					validation = false;
					return res.send(
						setRes(
							resCode.BadRequest,
							false,
							"This Product sub category name is already exists with this category!",
							null
						)
					);
				}
			}

			await productCategoryModel
				.findOne({
					where: {
						id: data.id,
						is_deleted: false,
						is_enable: true,
					},
				})
				.then(async (categoryData) => {
					if (categoryData != null) {
						if (data.image) {
							const params = {
								Bucket: awsConfig.Bucket,
								Key: categoryData.image,
							};
							awsConfig.deleteImageAWS(params);
						}
						await productCategoryModel
							.update(data, {
								where: {
									id: data.id,
									is_deleted: false,
									is_enable: true,
								},
							})
							.then(async (updateData) => {
								if (updateData == 1) {
									await productCategoryModel
										.findOne({
											where: {
												id: data.id,
												is_deleted: false,
												is_enable: true,
											},
										})
										.then(async (categoryDetail) => {
											if (categoryDetail.image != null) {
												var categoryDetail_image = await awsConfig
													.getSignUrl(categoryDetail.image)
													.then(function (res) {
														categoryDetail.image = res;
													});
											} else {
												categoryDetail.image = awsConfig.default_image;
											}
											if (categoryDetail.parent_id == 0) {
												return res.send(
													setRes(
														resCode.OK,
														true,
														"Product category updated successfully",
														data
													)
												);
											} else {
												return res.send(
													setRes(
														resCode.OK,
														true,
														"Product sub category updated successfully",
														data
													)
												);
											}
										});
								} else {
									res.send(
										setRes(
											resCode.BadRequest,
											false,
											"Fail to update category or service.",
											null
										)
									);
								}
							});
					} else {
						res.send(
							setRes(resCode.ResourceNotFound, false, "Category not found", null)
						);
					}
				});
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.RemoveCategory = async (req, res) => {
	try {
		var data = req.params;
		var productModel = models.products;
		var productCategoryModel = models.product_categorys;
		var cartModel = models.shopping_cart;
		var orderDetailsModel = models.order_details;
		var wishlistModel = models.wishlists;
		var Op = models.Op;

		if (data.id) {
			productModel
				.findAll({
					where: {
						[Op.or]: {
							category_id: data.id,
							sub_category_id: data.id,
						},
						is_deleted: false,
					},
				})
				.then((productData) => {
					var product_ids = [];
					for (const data of productData) {
						product_ids.push(data.id);
					}
					cartModel
						.findAll({
							where: {
								product_id: {
									[Op.in]: product_ids,
								},
								is_deleted: false,
							},
						})
						.then((cartData) => {
							if (cartData.length > 0) {
								res.send(
									setRes(
										resCode.BadRequest,
										false,
										"You can not delete this category because some product of this sub-category are into some user carts",
										null
									)
								);
							} else {
								wishlistModel
									.findAll({
										where: {
											product_id: {
												[Op.in]: product_ids,
											},
											is_deleted: false,
										},
									})
									.then((wishlistData) => {
										if (wishlistData.length > 0) {
											res.send(
												setRes(
													resCode.BadRequest,
													false,
													"You can not delete this category because some product of this sub-category are into some user wishlist",
													null
												)
											);
										} else {
											orderDetailsModel
												.findAll({
													where: {
														product_id: {
															[Op.in]: product_ids,
														},
														is_deleted: false,
														order_status: 1,
													},
												})
												.then((orderData) => {
													if (orderData.length > 0) {
														res.send(
															setRes(
																resCode.BadRequest,
																false,
																"You can not delete this category because some ongoing order of this sub-category product",
																null
															)
														);
													} else {
														productCategoryModel
															.findAll({
																where: {
																	parent_id: data.id,
																	is_deleted: false,
																	is_enable: true,
																},
															})
															.then(async (subCategoryData) => {
																if (subCategoryData.length > 0) {
																	return res.send(
																		setRes(
																			resCode.BadRequest,
																			false,
																			"You can not delete this category because some sub category are active.",
																			null
																		)
																	);
																} else {
																	productCategoryModel
																		.findOne({
																			where: {
																				id: data.id,
																				is_deleted: false,
																				is_enable: true,
																				parent_id: {
																					[Op.eq]: 0,
																				},
																			},
																		})
																		.then((categoryData) => {
																			if (categoryData != null) {
																				categoryData.update({
																					is_deleted: true,
																					is_enable: false,
																				});
																				res.send(
																					setRes(
																						resCode.OK,
																						true,
																						"Product category deleted successfully",
																						null
																					)
																				);
																			} else {
																				res.send(
																					setRes(
																						resCode.ResourceNotFound,
																						false,
																						"Product category not found",
																						null
																					)
																				);
																			}
																		});
																}
															});
													}
												});
										}
									});
							}
						});
				})
				.catch((error) => {
					res.send(
						setRes(resCode.InternalServer, false, "Internal server error.", null)
					);
				});
		} else {
			res.send(setRes.BadRequest, false, "id is required.", null);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.ProductTypeList = async (req, res) => {
	try {
		var data = req.body;
		var categoryModel = models.product_categorys;
		var Op = models.Op;

		var requiredFields = _.reject(["page", "page_size"], (o) => {
			return _.has(data, o);
		});
		if (requiredFields == "") {
			if (data.page < 0 || data.page === 0) {
				res.send(
					setRes(
						resCode.BadRequest,
						false,
						"invalid page number, should start with 1",
						null
					)
				);
			}
			var skip = data.page_size * (data.page - 1);
			var limit = parseInt(data.page_size);

			var searchPattern = data?.search ? "%" + data.search + "%" : null;
			var business_id = data.business_id;

			var query = `
    SELECT pc.*,
        (SELECT COUNT(*) FROM product_categorys
        WHERE is_deleted = false
        AND is_enable = true
        AND parent_id != 0
        ${data.category_id ? `AND parent_id = ${data.category_id}` : ""}
        AND (
            (type = 'admin' ${searchPattern ? `AND name LIKE :searchPattern` : ""})
            OR
            (type = 'business' ${searchPattern ? `AND name LIKE :searchPattern` : ""} AND (business_id = :business_id))
        )) AS total_count, parent.name AS category_name
    FROM product_categorys pc
    LEFT JOIN product_categorys parent ON pc.parent_id = parent.id
    WHERE pc.is_deleted = false
    AND pc.is_enable = true
    AND pc.parent_id != 0
    ${data.category_id ? `AND pc.parent_id = ${data.category_id}` : ""}
    AND (
        (pc.type = 'admin' ${searchPattern ? `AND pc.name LIKE :searchPattern` : ""})
        OR
        (pc.type = 'business' ${searchPattern ? `AND pc.name LIKE :searchPattern` : ""} AND (pc.business_id = :business_id))
    )
    ORDER BY pc.name ASC
    `;


			// Check if pagination is requested
			if (data.page_size != 0 && !_.isEmpty(data.page_size)) {
				query += ` LIMIT ${limit} OFFSET ${skip}`;
			}

			var allSubCategorys = await models.sequelize.query(query, {
				replacements: {
					searchPattern: searchPattern,
					business_id: business_id,
				},
				type: Sequelize.QueryTypes.SELECT,
			});
			for (const data of allSubCategorys) {
				if (data.image != null) {
					const signurl = await awsConfig
						.getSignUrl(data.image)
						.then(function (res) {
							data.image = res;
						});
				} else {
					data.image = commonConfig.default_image;
				}
			}
			const updatedResponse = allSubCategorys.map(obj => {
				obj.is_editable_deletable = obj.type == 'admin' ? false : true;
				return obj;
			});
			const totalRecords = updatedResponse[0].total_count;
			const response = new pagination(
				updatedResponse,
				parseInt(totalRecords),
				parseInt(data.page),
				parseInt(data.page_size)
			);
			res.send(
				setRes(
					resCode.OK,
					true,
					"Get Product sub category  details successfully.",
					response.getPaginationInfo()
				)
			);
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		console.log(error)
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.removeProductType = async (req, res) => {
	try {
		var data = req.params;
		var productCategoryModel = models.product_categorys;
		var cartModel = models.shopping_cart;
		var orderDetailsModel = models.order_details;
		var wishlistModel = models.wishlists;
		var productModel = models.products;
		var Op = models.Op;

		await productModel
			.findAll({
				where: {
					sub_category_id: data.id,
					is_deleted: false,
				},
			})
			.then(async (productData) => {
				if (productData.length > 0) {
					res.send(
						setRes(
							resCode.BadRequest,
							false,
							"You Can not delete this Product sub category because it contains Existing Products!",
							null
						)
					);
				} else {
					var product_ids = [];
					for (const data of productData) {
						product_ids.push(data.id);
					}
					await cartModel
						.findAll({
							where: {
								product_id: {
									[Op.in]: product_ids,
								},
								is_deleted: false,
							},
						})
						.then(async (cartData) => {
							if (cartData.length > 0) {
								res.send(
									setRes(
										resCode.BadRequest,
										false,
										"You can not delete this category because some product of this sub-category are into some user carts",
										null
									)
								);
							} else {
								wishlistModel
									.findAll({
										where: {
											product_id: {
												[Op.in]: product_ids,
											},
											is_deleted: false,
										},
									})
									.then((wishlistData) => {
										if (wishlistData.length > 0) {
											res.send(
												setRes(
													resCode.BadRequest,
													false,
													"You can not delete this category because some product of this sub-category are into some user wishlist",
													null
												)
											);
										} else {
											orderDetailsModel
												.findAll({
													where: {
														product_id: {
															[Op.in]: product_ids,
														},
														is_deleted: false,
														order_status: 1,
													},
												})
												.then((orderData) => {
													if (orderData.length > 0) {
														res.send(
															setRes(
																resCode.BadRequest,
																false,
																"You can not delete this category because some ongoing order of this sub-category product",
																null
															)
														);
													} else {
														productCategoryModel
															.findOne({
																where: {
																	id: data.id,
																	is_deleted: false,
																	is_enable: true,
																	parent_id: {
																		[Op.ne]: 0,
																	},
																},
															})
															.then((subCategoryData) => {
																if (subCategoryData != null) {
																	subCategoryData.update({
																		is_deleted: true,
																		is_enable: false,
																	});
																	res.send(
																		setRes(
																			resCode.OK,
																			true,
																			"Product sub category deleted successfully",
																			null
																		)
																	);
																} else {
																	res.send(
																		setRes(
																			resCode.ResourceNotFound,
																			false,
																			"Product sub category not found",
																			null
																		)
																	);
																}
															});
													}
												});
										}
									});
							}
						});
				}
			})
			.catch((error) => {
				res.send(
					setRes(resCode.BadRequest, false, "Internal server error.", null)
				);
			});
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.AddProductRattings = async (req, res) => {
	try {
		var data = req.body;
		var userModel = models.user;
		var productModel = models.products;
		var productRattingModel = models.product_ratings;
		var requiredFields = _.reject(
			["user_id", "product_id", "ratings", "description"],
			(o) => {
				return _.has(data, o);
			}
		);

		if (requiredFields == "") {
			userModel
				.findOne({
					where: {
						id: data.user_id,
						is_deleted: false,
						is_active: true,
					},
				})
				.then(async (user) => {
					if (_.isEmpty(user)) {
						res.send(
							setRes(resCode.ResourceNotFound, false, "User not found.", null)
						);
					} else {
						productModel
							.findOne({
								where: {
									id: data.product_id,
									is_deleted: false,
								},
							})
							.then(async (product) => {
								if (_.isEmpty(product)) {
									res.send(
										setRes(
											resCode.ResourceNotFound,
											false,
											"Product not found.",
											null
										)
									);
								} else {
									productRattingModel
										.findOne({
											where: {
												user_id: data.user_id,
												product_id: data.product_id,
												is_deleted: false,
											},
										})
										.then((rattingData) => {
											if (rattingData != null) {
												productRattingModel
													.update(data, {
														where: {
															user_id: data.user_id,
															product_id: data.product_id,
														},
													})
													.then((updateData) => {
														if (updateData == 1) {
															productRattingModel
																.findOne({
																	where: {
																		product_id: data.product_id,
																		user_id: data.user_id,
																		is_deleted: false,
																	},
																})
																.then((rattingDetails) => {
																	res.send(
																		setRes(
																			resCode.OK,
																			true,
																			"Product ratting update successfully",
																			rattingDetails
																		)
																	);
																});
														} else {
															res.send(
																setRes(
																	resCode.InternalServer,
																	false,
																	"Internal server error",
																	null
																)
															);
														}
													});
											} else {
												productRattingModel
													.create(data)
													.then((addRattingData) => {
														res.send(
															setRes(
																resCode.OK,
																true,
																"Product ratting save successfully",
																addRattingData
															)
														);
													});
											}
										})
										.catch((error) => {
											res.send(
												setRes(
													resCode.BadRequest,
													false,
													"Fail to add product ratting",
													null
												)
											);
										});
								}
							});
					}
				});
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.GetProductRattings = async (req, res) => {
	try {
		var data = req.body;
		var productRattingModel = models.product_ratings;
		var productModel = models.products;
		var userModel = models.user;
		const businessModel = models.business;
		const Op = models.Op;
		var requiredFields = _.reject(["product_id", "page", "page_size"], (o) => {
			return _.has(data, o);
		});
		let userDetail, userRole;
		var authUser = req.user;

		userDetail = await userModel.findOne({
			where: {
				email: authUser.user,
			},
		});
		if (userDetail) {
			userRole = userDetail?.role_id;
		} else {
			userDetail = await businessModel.findOne({
				where: {
					email: authUser.user,
				},
			});
			if (userDetail) {
				userRole = authUser.role_id;
			}
		}

		const reportedReviewCond =
			userRole && userRole === 2
				? {
					user_id: authUser.id,
				}
				: {};

		const whereCond = {
			[Op.or]: [
				{
					product_id: data.product_id,
					is_deleted: false,
					is_review_report: true,
					...reportedReviewCond,
				},
				{
					product_id: data.product_id,
					is_deleted: false,
					is_review_report: false,
					user_id: { [Op.not]: userDetail.id },
				},
			],
		};

		if (requiredFields == "") {
			const condition = {
				where: whereCond,
				include: {
					model: userModel,
				},
				order: [["createdAt", "DESC"]],
				attributes: { exclude: ["is_deleted", "updatedAt"] },
			};

			const skip = data.page_size * (data.page - 1);
			const limit = parseInt(data.page_size);

			if (data.page_size != 0 && !_.isEmpty(data.page_size)) {
				(condition.offset = skip), (condition.limit = limit);
			}
			const proCondition = {};
			proCondition.where = { id: data.product_id, is_deleted: false };
			if (data.business_id) {
				proCondition.where = {
					...proCondition.where,
					...{ business_id: data.business_id },
				};
			}
			const productDetails = await productModel.findOne(proCondition);
			if (productDetails) {
				const recordCounts = await productRattingModel.findAndCountAll(condition);
				const totalRecords = recordCounts?.count;

				await productRattingModel
					.findAll(condition)
					.then(async (ratingData) => {
						for (const data of ratingData) {
							data.dataValues.user_name = data.user.username;
							if (data.user.profile_picture != null) {
								const signurl = await awsConfig
									.getSignUrl(data.user.profile_picture)
									.then(function (res) {
										data.dataValues.profile_picture = res;
									});
							} else {
								data.dataValues.profile_picture = commonConfig.default_user_image;
							}
							data.dataValues.ratings = data.ratings;
							data.dataValues.review = data.description;

							delete data.dataValues.user;
							delete data.dataValues.description;
						}
						const response = new pagination(
							ratingData,
							parseInt(totalRecords),
							parseInt(data.page),
							parseInt(data.page_size)
						);
						res.send(
							setRes(
								resCode.OK,
								true,
								"Get ratings list successfully",
								response.getPaginationInfo()
							)
						);
					})
					.catch((error) => {
						res.send(
							setRes(resCode.BadRequest, false, "Fail to get ratings", null)
						);
					});
			} else {
				res.send(
					setRes(resCode.ResourceNotFound, false, "Product not found", null)
				);
			}
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.productRatting = async (req, res) => {
	try {
		var params = req.params;
		var data = req.query;
		var productModel = models.products;
		var requiredFields = _.reject(["order_id"], (o) => {
			return _.has(data, o);
		});
		var { role_id } = req.user;
		var orderDetailsModel = models.order_details;

		if (requiredFields == "") {
			const proCondition = {
				include: {
					model: productModel,
				},
			};
			proCondition.where = { product_id: params.id, is_deleted: false };
			if (data.order_id) {
				proCondition.where = {
					...proCondition.where,
					...{ order_id: data.order_id },
				};
			}
			if (data.business_id) {
				proCondition.where = {
					...proCondition.where,
					...{ business_id: data.business_id },
				};
			}
			const orderDetails = await orderDetailsModel.findOne(proCondition);
			if (orderDetails) {
				const response = {};
				response.product_name = orderDetails.product?.name
					? orderDetails.product?.name
					: null;
				response.qty = orderDetails.qty;
				response.price = orderDetails.price;
				response.order_status = orderDetails.order_status;
				if (orderDetails?.product?.image != null) {
					await awsConfig
						.getSignUrl(orderDetails?.product?.image[0])
						.then(function (res) {
							response.product_image = res;
						});
				} else {
					response.product_image = commonConfig.default_image;
				}
				res.send(
					setRes(resCode.OK, true, "Get product review succesfully..", response)
				);
			} else {
				res.send(
					setRes(resCode.ResourceNotFound, false, "Product not found", null)
				);
			}
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.reportCustomerReview = async (req, res) => {
	try {
		const data = req.body;
		const user = req?.user || {};
		const businessModel = models.business;
		const userModel = models.user;
		const productModel = models.products;
		const productRattingModel = models.product_ratings;
		const requiredFields = _.reject(["product_rating_id", "description"], (o) => {
			return _.has(data, o);
		});
		if (requiredFields == "") {
			await businessModel.findOne({ where: { id: user.id  } }).then(async (business) => {
				if (business) {
					await productRattingModel
						.findOne({
							where: { id: data.product_rating_id, is_deleted: false },
							include: [
								{
									model: userModel,
									attributes: ['username']
								},
								{
									model: productModel,
									attributes: ['id', 'name']
								}
							],
							attributes: { exclude: ["createdAt", "updatedAt"] },
						})
						.then(async (productRating) => {
							if (productRating) {
								await productRattingModel
									.update(
										{
											is_review_report: true,
											report_description: data.description,
										},
										{
											where: {
												id: data.product_rating_id,
											},
										}
									)
									.then(async (UpdateData) => {
										var transporter = nodemailer.createTransport({
											host: mailConfig.host,
											port: mailConfig.port,
											secure: mailConfig.secure,
											auth: mailConfig.auth,
											tls: mailConfig.tls
										});
										var templates = new EmailTemplates();
										const context = {
											productName: productRating.product.name,
											userName: productRating.user.username,
											userReview:productRating.description,
											businessName: business.business_name,
											businessEmail: business.email,
											description: data.description,
											url: `${commonConfig.admin_url}/products/view/${productRating.product.id}`,
										};
										templates.render(
											path.join(
												__dirname,
												"../../",
												"template",
												"report.html"
											),
											context,
											(err, html, text, subject) => {
												// console.log(text);
												if (err) {
													console.error("Template rendering error", err);
													return;
												}
												transporter.sendMail(
													{
														from: "b.a.s.e. <do-not-reply@mail.com>",
														to: "kureshi.sakil@technostacks.in",
														subject: `Urgent: Product Review Report - ${productRating.product.name}`,
														html: html,
													},
													async function (err, result) {
														console.log(result);
														console.log(err);
														if (err) {
															return res.send(
																setRes(
																	resCode.BadRequest,
																	false,
																	"Something went wrong.",
																	err
																)
															);
														} else {
															
															await productRattingModel
																.findOne({
																	where: { id: data.product_rating_id, is_deleted: false },
																	attributes: { exclude: ["createdAt", "updatedAt"] },
																})
																.then(async (updatedproductRating) => {
																	return res.send(
																		setRes(
																			resCode.OK,
																			true,
																			"Review reported successfully.",
																			updatedproductRating
																		)
																	);
																});
														}
													}
												);
											}
										);
									})
									.catch((error) => {
										console.log(error);
										res.send(
											setRes(
												resCode.InternalServer,
												false,
												"Fail to  Customer review.",
												null
											)
										);
									});
							} else {
								res.send(
									setRes(
										resCode.InternalServer,
										false,
										"Product review not found.",
										null
									)
								);
							}
						});
				} else {
					res.send(
						setRes(resCode.BadRequest, false, "Business User not exists ", null)
					);
				}
			});
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

//  Simillar product get
exports.simillarProducts = async (req, res) => {
	try {
		var val = req.params;
		var productModel = models.products;
		var productCategoryModel = models.product_categorys;
		var Op = models.Op;
		var requiredFields = _.reject(["id"], (o) => {
			return _.has(val, o);
		});

		if (requiredFields == "") {
			productModel
				.findOne({
					where: {
						id: val.id,
						is_deleted: false,
					},
				})
				.then(async (product) => {
					if (_.isEmpty(product) || product == null || product == 0) {
						return res.send(
							setRes(resCode.ResourceNotFound, true, "Product not found.", null)
						);
					} else {
						var condition = {};
						condition.where = {
							is_deleted: false,
							id: {
								[Op.ne]: product.id,
							},
							category_id: product.category_id,
						};
						condition.attributes = [
							"id",
							"name",
							"price",
							"description",
							"category_id",
							"image",
							"product_item",
						];
						productModel.findAll(condition).then(async (categoryData) => {
							if (categoryData.length > 0) {
								const shuffledArrays = _.shuffle(categoryData);
								let responseData = shuffledArrays.slice(0, 5);
								for (const data of responseData) {
									var rewards = [];
									const cashbaksModel = models.cashbacks;
									var discountsModel = models.discounts;
									const loyaltyPointModel = models.loyalty_points;
									var couponModel = models.coupones;
									var Op = models.Op;
									const discounts = await discountsModel.findAll({
										attributes: {
											exclude: [
												"createdAt",
												"updatedAt",
												"deleted_at",
												"isDeleted",
											],
										},
										where: {
											product_id: {
												[Op.regexp]: `(^|,)${data.id}(,|$)`,
											},
											status: true,
											isDeleted: false,
										},
									});
									for (const data of discounts) {
										let discountString = "";
										if (data.discount_type == 0) {
											discountString += `${data.discount_value}% Discount`;
										} else {
											discountString += `$${data.discount_value} Discount`;
										}
										rewards.push({
											type: "discounts",
											title: discountString,
											business_id: data.business_id,
											discount_type: data.discount_type,
											discount_value: data.discount_value,
											product_category_id: data.product_category_id,
											product_id: data.product_id,
											validity_for: data.validity_for,
											status: data.status,
										});
									}

									const coupones = await couponModel.findAll({
										attributes: [
											"id",
											"value_type",
											"coupon_value",
											"coupon_type",
										],
										where: {
											product_id: {
												[Op.regexp]: `(^|,)${data.id}(,|$)`,
											},
											status: true,
											isDeleted: false,
										},
									});
									for (const data of coupones) {
										let couponString = "";
										if (data.coupon_type == 1) {
											if (data.value_type == 1) {
												couponString += `${data.coupon_value}% Discount`;
											} else {
												couponString += `$${data.coupon_value} Discount`;
											}
											rewards.push({ type: "coupones", title: couponString });
										}
									}

									const cashbacks = await cashbaksModel.findAll({
										attributes: [
											"id",
											"cashback_value",
											"cashback_type",
											"cashback_on",
										],
										where: {
											product_id: {
												[Op.regexp]: `(^|,)${data.id}(,|$)`,
											},
											status: true,
											isDeleted: false,
										},
									});
									for (const data of cashbacks) {
										let discountString = "";
										if (data.cashback_on == 0) {
											if (data.cashback_type == 0) {
												discountString += `${data.cashback_value}% cashback`;
											} else {
												discountString += `$${data.cashback_value} cashback`;
											}
											rewards.push({ type: "cashbacks", title: discountString });
										}
									}

									const loyaltyPoints = await loyaltyPointModel.findAll({
										attributes: ["id", "loyalty_type", "points_earned"],
										where: {
											product_id: {
												[Op.regexp]: `(^|,)${data.id}(,|$)`,
											},
											status: true,
											isDeleted: false,
										},
									});
									for (const data of loyaltyPoints) {
										let loyaltyString = "";
										if (data.loyalty_type == 1) {
											loyaltyString += `Earn ${data.points_earned} points`;
											rewards.push({
												type: "loyalty_points",
												title: loyaltyString,
											});
										}
									}
									if (data.image != null && !_.isEmpty(data.image)) {
										var product_image = await awsConfig
											.getSignUrl(data.image[0])
											.then(function (res) {
												data.dataValues.product_image = res;
											});
									} else {
										data.dataValues.product_image = commonConfig.default_image;
									}

									if (data.product != null) {
										data.dataValues.business_id = data.business_id;
									} else {
										data.dataValues.business_id = null;
									}

									if (data.product != null) {
										data.dataValues.product_name = data.name;
									} else {
										data.dataValues.product_name = null;
									}

									if (data.product_categorys != null) {
										data.dataValues.category_name = data.product_categorys.name;
									} else {
										data.dataValues.category_name = null;
									}
									if (data.sub_category != null) {
										data.dataValues.sub_category_name = data.sub_category.name;
									} else {
										data.dataValues.sub_category_name = null;
									}

									if (data.description != null) {
										data.dataValues.description = data.description;
									} else {
										data.dataValues.description = null;
									}

									if (data.product != null) {
										data.dataValues.rating = null;
									} else {
										data.dataValues.rating = null;
									}
									data.dataValues.rewards = rewards;
									var product_image = data.image;
									var image_array = [];
									if (product_image != null) {
										for (const data of product_image) {
											const signurl = await awsConfig
												.getSignUrl(data)
												.then(function (res) {
													image_array.push(res);
												});
										}
									} else {
										image_array.push(commonConfig.default_image);
									}
									if (product_image.length == 0) {
										image_array.push(commonConfig.default_image);
									}
									data.dataValues.product_image = _.first(image_array);
									delete data.dataValues.image;
								}
								return res.send(
									setRes(
										resCode.OK,
										true,
										"Get simillar products details.",
										responseData
									)
								);
							} else {
								res.send(
									setRes(
										resCode.ResourceNotFound,
										true,
										"Get simillar products details not found.",
										[]
									)
								);
							}
						});
					}
				})
				.catch((error) => {
					res.send(
						setRes(
							resCode.BadRequest,
							false,
							"Fail to get simillar products.",
							null
						)
					);
				});
		} else {
			res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};

exports.deleteProduct = async (req, res) => {
	try {
		var data = req.params;
		var validation = true;
		var productModel = models.products;
		var shoppingCartModel = models.shopping_cart;
		var wishlistModel = models.wishlists;
		var orderDetailsModel = models.order_details;
		var requiredFields = _.reject(["id"], (o) => {
			return _.has(data, o);
		});
		var Op = models.Op;

		if (requiredFields == "") {
			await productModel
				.findOne({
					where: {
						id: data.id,
						is_deleted: false,
					},
				})
				.then(async (product) => {
					if (product != null) {
						const cartProduct = await shoppingCartModel.findAll({
							where: {
								product_id: product.id,
								is_deleted: false,
							},
						});

						if (cartProduct.length > 0) {
							validation = false;
							return res.send(
								setRes(
									resCode.BadRequest,
									false,
									"You can not delete this product because this product is in cart",
									null
								)
							);
						}

						const orders = await orderDetailsModel.findAll({
							where: {
								product_id: product.id,
								is_deleted: false,
								order_status: {
									[Op.ne]: 3,
								},
							},
						});

						if (orders.length > 0) {
							validation = false;
							return res.send(
								setRes(
									resCode.BadRequest,
									false,
									"You can not delete this product because this product is in orders",
									null
								)
							);
						}

						const wishlistProduct = await wishlistModel.findAll({
							where: {
								product_id: product.id,
								is_deleted: false,
							},
						});

						if (wishlistProduct.length > 0) {
							validation = false;
							return res.send(
								setRes(
									resCode.BadRequest,
									false,
									"You can not delete this product because this product is in wishlist",
									null
								)
							);
						}

						await product
							.update({
								is_deleted: true,
							})
							.then(async (deleteData) => {
								if (deleteData) {
									var product_images = deleteData.image;
									var image_array = [];
									if (product_images != null) {
										for (const data of product_images) {
											const params = {
												Bucket: awsConfig.Bucket,
												Key: data,
											};
											awsConfig.deleteImageAWS(params);
										}
									}
									await productModel
										.findOne({
											where: {
												id: data.id,
											},
										})
										.then(async (delProduct) => {
											return res.send(
												setRes(
													resCode.OK,
													true,
													"Product deleted successfully",
													delProduct
												)
											);
										});
								}
							});
					} else {
						return res.send(
							setRes(resCode.ResourceNotFound, false, "Product not found.", null)
						);
					}
				});
		} else {
			return res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		return res.send(
			setRes(resCode.BadRequest, false, "Something went wrong!", null)
		);
	}
};
