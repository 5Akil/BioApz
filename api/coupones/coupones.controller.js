var mongoose = require('mongoose')
var async = require('async')
var crypto = require('crypto')
var EmailTemplates = require('swig-email-templates')
var nodemailer = require('nodemailer')
var path = require('path')
var resCode = require('../../config/res_code_config')
var commonConfig = require('../../config/common_config')
var setRes = require('../../response')
var jwt = require('jsonwebtoken');
var models = require('../../models')
var bcrypt = require('bcrypt')
var _ = require('underscore')
var moment = require('moment')
const Sequelize = require('sequelize');
var notification = require('../../push_notification')
var awsConfig = require('../../config/aws_S3_config')
const fs = require('fs');
var multer = require('multer');
const multerS3 = require('multer-s3');
var pagination = require('../../helpers/pagination')

// Create Reward coupones START
exports.create = async (req,res) => {
	try {
		var data = req.body
		var businessModel = models.business
		var couponeModel = models.coupones
		var Op = models.Op;
		var validation = true;
		var categoryModel = models.product_categorys
		var productModel = models.products

		let arrayFields = ['business_id','title','coupon_type','coupon_value','validity_for','expire_at','description'];
		const result = data.coupon_type == 0 ? (arrayFields.push('product_id')) : (arrayFields.push('value_type'));
		var valueType = (!(_.isEmpty(data.value_type)) && (data.value_type == 0)) ? ((data.coupon_value >= Math.min(1,100)) && (data.coupon_value <= Math.max(1,100))) : null

		var requiredFields = _.reject(arrayFields,(o) => {return _.has(data,o)})

		if(requiredFields.length == 0) {
			const couponTitle = data?.title?.trim() || data.title;
			var currentDate = (moment().format('YYYY-MM-DD') == moment(data.expire_at).format('YYYY-MM-DD'))
			var pastDate = moment(data.expire_at,'YYYY-MM-DD').isBefore(moment());
			if(!Number(data.coupon_value) || isNaN(data.coupon_value) || data.coupon_value <= 0) {
				return res.send(setRes(resCode.BadRequest,false,"Coupon value should be greater than 0!",null))
			}
			if(currentDate || pastDate) {
				return res.send(setRes(resCode.BadRequest,false,"You can't select past and current date.!",null))
			}
			if(valueType == false && valueType != null) {
				return res.send(setRes(resCode.BadRequest,false,"Please enter valid percentage value!",null))
			}
			const couponeCode = data.coupone_code ? data.coupone_code.trim() : (data.coupon_code ? data.coupon_code.trim() : '');
			data.coupon_code = couponeCode;
			if(data?.coupon_code && data?.coupon_code != null) {
				if(data?.coupon_code?.trim().length > 50) {
					return res.send(setRes(resCode.BadRequest,false,"Please enter valid Coupon Code!",null))
				}
				const isCouponCodeExists = await couponeModel.findOne({where: {business_id: data.business_id,coupon_code: data.coupon_code.trim(),status: true,isDeleted: false}});
				console.log('isCouponCodeExists',isCouponCodeExists);
				if(isCouponCodeExists) {
					return res.send(setRes(resCode.BadRequest,false,"Coupon Code already exists!",null))
				}
			}
			var valcheck = true;
			if(validation) {
				if(data.product_category_id) {
					await categoryModel.findOne({
						where: {
							id: data.product_category_id,is_deleted: false,is_enable: true,business_id: data.business_id,parent_id: {
								[Op.eq]: 0
							}
						}
					}).then(async productCategory => {
						if(_.isEmpty(productCategory)) {
							valcheck = false;
							return res.send(setRes(resCode.ResourceNotFound,false,"Product Category not found.",null))
						}

					})
				}
				var lowerpriceAmount = {};
				if(data.product_id && valcheck == true) {
					var products = !_.isEmpty(data.product_id) ? data.product_id : '';
					var proArray = products.split(",");
					await productModel.findAll({
						where: {id: {[Op.in]: proArray},is_deleted: false,business_id: data.business_id},
						order: [['price','ASC']],
					}).then(async products => {
						if(_.isEmpty(products) || (products.length != proArray.length)) {
							valcheck = false;
							return res.send(setRes(resCode.ResourceNotFound,false,"Product not found.",null))
						}
						lowerpriceAmount = products[0];
					})
				}
				if(valcheck) {
					var couponAmount = lowerpriceAmount.price * data.coupon_value / 100;
					if((data.value_type == true && data.coupon_value >= lowerpriceAmount.price) || (data.value_type == false && lowerpriceAmount.price >= couponAmount)) {
						return res.send(setRes(resCode.BadRequest,false,"Please enter coupon value less then selected products min value!",null))
					} else {
						await businessModel.findOne({
							where: {id: data.business_id,is_deleted: false,is_active: true}
						}).then(async business => {
							if(_.isEmpty(business)) {
								return res.send(setRes(resCode.ResourceNotFound,false,"Business not found.",null))
							} else {
								await couponeModel.findOne({
									where: {isDeleted: false,status: true,title: {[Op.eq]: couponTitle}}
								}).then(async couponSame => {
									if(couponSame) {
										return res.send(setRes(resCode.BadRequest,false,"Coupon title already taken.!",null))
									} else {
										if(data?.coupon_type == 0) {
											data.value_type = true;
										}
										await couponeModel.create(data
											// 	{
											// 	business_id:!(_.isEmpty(data.business_id) && data.business_id == null) ? data.business_id : null,
											// 	title:!(_.isEmpty(data.title) && data.title == null) ? data.title : null,
											// 	coupon_type:!(_.isEmpty(data.coupon_type) && data.coupon_type == null) ? data.coupon_type : null,
											// 	product_category_id:(!(_.isEmpty(data.product_category_id) && data.product_category_id == null)) && data.coupon_type == 0 ? data.product_category_id : null,
											// 	product_id:(!(_.isEmpty(data.product_id) && data.product_id == null)) && (!_.isEmpty(data.product_category_id)) && data.coupon_type == 0  ? data.product_id : null,
											// 	value_type:!(_.isEmpty(data.value_type) && data.value_type == null) && data.coupon_type == 1 && data.coupon_type != null ? data.value_type : null,
											// 	coupon_value:(!(_.isEmpty(data.coupon_value) && data.coupon_value == null)) ? data.coupon_value : null,
											// 	validity_for:!(_.isEmpty(data.validity_for) && data.validity_for == null) ? data.validity_for : null,
											// 	expire_at:!(_.isEmpty(data.expire_at) && data.expire_at == null) ? data.expire_at : null,
											// 	description:!(_.isEmpty(data.description) && data.description == null) ? data.description : null
											// }
										).then(async couponeData => {
											if(couponeData) {
												return res.send(setRes(resCode.OK,true,"Coupon added successfully",couponeData))
											} else {
												return res.send(setRes(resCode.BadRequest,false,"Fail to create coupon.",null))
											}
										})
									}
								})
							}
						})
					}

				}

			}

		} else {
			return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		return res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}
// Create Reward coupones END

// Delete Reward coupones START
exports.delete = async (req,res) => {
	try {
		var data = req.params
		var couponeModel = models.coupones
		var requiredFields = _.reject(['id'],(o) => {return _.has(data,o)})
		if(requiredFields == "") {
			couponeModel.findOne(
				{
					where: {id: data.id,isDeleted: false,deleted_at: null}
				}).then(async couponeData => {
					if(couponeData) {
						await couponeData.update({
							isDeleted: true,
							status: false
						}).then(async deleteData => {
							if(deleteData) {
								await couponeModel.findOne({
									where: {
										id: deleteData.id
									}
								}).then(async Data => {
									Data.destroy();
								});
							}
						});
						res.send(setRes(resCode.OK,true,"Coupones deleted successfully",null))
					} else {
						res.send(setRes(resCode.ResourceNotFound,false,"Coupon not found",null))
					}
				}).catch(error => {
					res.send(setRes(resCode.BadRequest,false,error,null))
				})
		} else {
			res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}
// Delete Reward coupones END

// Update Reward coupones START
exports.update = async (req,res) => {
	try {
		var data = req.body
		var productModel = models.products
		var couponeModel = models.coupones
		var Op = models.Op;
		var validation = true;
		let arrayFields = ['id','title','coupon_type','coupon_value','validity_for','expire_at','description'];
		// const result = data.coupon_type == 0 ? (arrayFields.push('product_category_id', 'product_id')) : (arrayFields.push('value_type'));
		var valueType = (!(_.isEmpty(data.value_type)) && (data.value_type == 0)) ? ((data.coupon_value >= Math.min(1,100)) && (data.coupon_value <= Math.max(1,100))) : null

		var requiredFields = _.reject(arrayFields,(o) => {return _.has(data,o)})

		if(requiredFields.length == 0) {
			const couponTitle = data?.title?.trim() || data.title;
			var currentDate = (moment().format('YYYY-MM-DD') == moment(data.expire_at).format('YYYY-MM-DD'))
			var pastDate = moment(data.expire_at,'YYYY-MM-DD').isBefore(moment());
			if(currentDate || pastDate) {
				validation = false;
				return res.send(setRes(resCode.BadRequest,false,"You can't select past and current date.!",null))
			}
			if(valueType == false && valueType != null) {
				validation = false;
				return res.send(setRes(resCode.BadRequest,false,"Please enter valid percentage value!",null))
			}
			if(!Number(data.coupon_value) || isNaN(data.coupon_value) || data.coupon_value <= 0) {
				validation = false;
				return res.send(setRes(resCode.BadRequest,false,"Coupon value should be greater than 0!",null))
			}
			const couponeCode = data.coupone_code ? data.coupone_code.trim() : (data.coupon_code ? data.coupon_code.trim() : '');
			data.coupon_code = couponeCode;
			if(data?.coupon_code && data?.coupon_code != null) {
				const isCouponCodeExists = await couponeModel.findOne({where: {coupon_code: data.coupon_code,status: true,isDeleted: false,id: {[Op.ne]: data.id}}});
				if(isCouponCodeExists) {
					return res.send(setRes(resCode.BadRequest,false,"Coupon Code already exists!",null))
				}
			}


			if(validation) {
				await couponeModel.findOne({
					where: {id: data.id,isDeleted: false,status: true,deleted_at: null}
				}).then(async couponeDetails => {
					if(_.isEmpty(couponeDetails)) {
						res.send(setRes(resCode.ResourceNotFound,false,"Coupon not found.",null))
					} else {
						var products = null;
						if(data.product_id) {
							var allproducats = data.product_id;
							var proArray = allproducats.split(",");
							products = await productModel.findAll({
								where: {id: {[Op.in]: proArray},is_deleted: false},
								order: [['price','ASC']],
								limit: 1
							});
						}
						var lowerpriceAmount = products[0].price;
						var couponAmount = data.value_type == false ? lowerpriceAmount * data.coupon_value / 100 : data.coupon_value;
						if((data.value_type == true && data.coupon_value >= couponAmount) || (data.value_type == false && lowerpriceAmount >= couponAmount)) {
							return res.send(setRes(resCode.BadRequest,false,"Please enter coupon value less then selected products min value!",null))
						} else {
							await couponeModel.findOne({
								where: {isDeleted: false,status: true,deleted_at: null,title: {[Op.eq]: couponTitle},id: {[Op.ne]: data.id}}
							}).then(async nameData => {
								if(nameData == null) {
									if(data.coupon_type == 0 && data.coupon_type != null) {
										data.value_type = 1;
									}
									await couponeModel.update(data,
										//{
										// 	title: !(_.isEmpty(data.title) && data.title == null) ? data.title : null,
										//coupon_type: !(_.isEmpty(data.coupon_type == 0)) ? data.coupon_type : null,
										// 	product_category_id: (!(_.isEmpty(data.product_category_id) && data.product_category_id == null)) && data.coupon_type == 0 ? data.product_category_id : null,
										// 	product_id: (!(_.isEmpty(data.product_id) && data.product_id == null)) && (!_.isEmpty(data.product_category_id)) && data.coupon_type == 0 ? data.product_id : null,
										//value_type: data.coupon_type == 0 && data.coupon_type != null ? data.value_type = 1 : data.value_type = 0,
										// 	coupon_value: (!(_.isEmpty(data.coupon_value) && data.coupon_value == null)) ? data.coupon_value : null,
										// 	validity_for: !(_.isEmpty(data.validity_for) && data.validity_for == null) ? data.validity_for : null,
										// 	expire_at: !(_.isEmpty(data.expire_at) && data.expire_at == null) ? data.expire_at : null,
										// 	description: !(_.isEmpty(data.description) && data.description == null) ? data.description : null
										// },
										{
											where: {id: data.id,isDeleted: false,status: true,deleted_at: null}
										}).then(async updateData => {
											if(updateData) {
												await couponeModel.findOne({
													where: {id: data.id},include: [
														{
															model: models.product_categorys,
															attributes: ['id','name']
														}
													],
												}).then(async data => {
													const products = await productModel.findAll({where: {id: {[Op.in]: data.product_id?.split(',') || []}},attributes: ["name"],raw: true});
													const product_name_arr = products?.map(val => val.name);
													const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
													data.dataValues.type = "coupones";
													// data.dataValues.value_type = data.coupon_type;
													data.dataValues.amount = data.coupon_value;
													if(data.expire_at < moment().format('YYYY-MM-DD')) {
														data.dataValues.is_expired = true;
													} else {
														data.dataValues.is_expired = false;
													}
													data.dataValues.product_category_name = data?.product_category?.name || '';
													data.dataValues.product_name = product_name.trim();
													delete data.dataValues.product_category;
													res.send(setRes(resCode.OK,true,'coupon update successfully',data))
												})
											} else {
												res.send(setRes(resCode.BadRequest,false,"Fail to update coupon.",null))
											}
										})
								} else {
									res.send(setRes(resCode.BadRequest,false,"Coupon title already taken.!",null))
								}
							})
						}
					}
				})
			}

		} else {
			res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		console.log(error)
		res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}

exports.applyCoupon = async (req,res) => {
	try {
		const data = req.body;
		const productModel = models.products;
		const userModel = models.user;
		const couponeModel = models.coupones
		const userCouponModel = models.user_coupons;

		const userAuth = req.user;
		const arrayFields = ['coupon_id','order_id'];
		const requiredFields = _.reject(arrayFields,(o) => {return _.has(data,o)})

		if(requiredFields.length == 0) {
			// check user is active and not deleted
			const userDetails = await userModel.findOne({
				where: {
					email: userAuth.user,
					id: userAuth.id,
					is_deleted: false
				}
			})
			if(!userDetails || _.isEmpty(userDetails) || _.isUndefined(userDetails)) {
				return res.send(setRes(resCode.ResourceNotFound,false,'User not found',null))
			}

			// get coupon details if active and exists
			const couponDetails = await couponeModel.findOne({
				where: {
					id: data.coupon_id,
					isDeleted: false,
					status: true
				}
			})

			if(!couponDetails || _.isEmpty(couponDetails) || _.isUndefined(couponDetails)) {
				return res.send(setRes(resCode.ResourceNotFound,false,'Coupone not found',null))
			}
			// check if user has already applied coupon
			const appliedCoupon = await userCouponModel.findOne({
				where: {
					user_id: userAuth?.id,
					coupon_id: data.coupon_id,
					is_deleted: false
				}
			})
			if(appliedCoupon && !_.isEmpty(appliedCoupon)) {
				return res.send(setRes(resCode.BadRequest,false,'Sorry,You have used this coupon code!',null))
			}
			// check free product coupon is applied for product
			if(couponDetails.product_id) {
				// apply coupon for user
				if(data?.order_value && !isNaN(data.order_value)) {
					if(Number(couponDetails.coupon_value) > Number(data.order_value)) {
						return res.send(setRes(resCode.BadRequest,false,`Coupon minimum order value ${couponDetails.coupon_value}`,null));
					}
				}
				const userCouponDetail = await userCouponModel.create({
					coupon_id: data.coupon_id,
					user_id: userAuth.id,
					order_id: data.order_id,
				});
				if(userCouponDetail) {
					res.send(setRes(resCode.OK,true,'Coupon applied successfully!',userCouponDetail))
				} else {
					res.send(setRes(resCode.BadRequest,false,'Failed to apply coupon',null))
				}

			} else {
				res.send(setRes(resCode.BadRequest,false,'Coupon is not applicable for this product',null))
			}
		} else {
			res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		console.log(error)
		res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}

exports.getUserCouponList = async (req,res) => {
	try {
		const data = req.body;
		const authUser = req.user;
		const arrayFields = ['page','business_id','page_size'];
		const requiredFields = _.reject(arrayFields,(o) => {return _.has(data,o);})
		const couponeModel = models.coupones;
		const userCouponModel = models.user_coupons;
		const currentDate = moment().format('YYYY-MM-DD');
		var Op = models.Op;
		var productModel = models.products

		const skip = data.page_size * (data.page - 1)
		const limit = parseInt(data.page_size)
		if(requiredFields.length == 0) {
			if(data.page === '' || parseInt(data.page) < 0 || parseInt(data.page) === 0) {
				return res.send(setRes(resCode.BadRequest,false,"invalid page number, should start with 1",null))
			}
			if(data.page_size === '') {
				return res.send(setRes(resCode.BadRequest,false,"invalid page size",null))
			}
			if(data.business_id === '') {
				return res.send(setRes(resCode.BadRequest,false,"invalid business_id",null))
			}

			const condition = {
				attributes: {exclude: ['createdAt','updatedAt','deleted_at']},
				where: {
					business_id: data.business_id,
					isDeleted: false,
					status: 1,
					expire_at: {
						[Op.gte]: currentDate
					}
				}
			}

			if(data.page_size != 0 && !_.isEmpty(data.page_size)) {
				condition.offset = skip,
					condition.limit = limit
			}

			const getCouponList = await couponeModel.findAll(condition);
			for(const val of getCouponList) {
				var is_applied = false;
				const appliedCoupon = await userCouponModel.findOne({
					where: {is_deleted: false,user_id: authUser.id,coupon_id: val.id}
				})
				var productsId = val.product_id
				var couponProducts = [];
				var product_ids = !_.isNull(val.product_id) && (val.product_id) ? productsId.split(',') : null;
				if(!_.isEmpty(product_ids) && !_.isNull(product_ids)) {
					for(const product of product_ids) {
						var productVal = await productModel.findOne({
							attributes: {
								exclude: ["createdAt","updatedAt","deleted_at","isDeleted"],
							},
							where: {
								id: product,
								is_deleted: false,
							},
						});
						var isFree = false;


						if(productVal) {
							var couponData = await couponeModel.findOne({
								where: {
									isDeleted: false,
									status: true,
									coupon_type: false,
									product_id: {
										[Op.regexp]: `(^|,)${product}(,|$)`,
									}
								}
							});
							if(!(_.isNull(couponData))) {
								isFree = true;
							}
							productVal.dataValues.is_free = isFree
						}
						couponProducts.push(productVal);
					}
				}
				if(!_.isEmpty(appliedCoupon)) {is_applied = true;}
				val.dataValues.is_applied = is_applied;
				val.dataValues.products = couponProducts;
			}
			const recordCount = await couponeModel.findAndCountAll(condition);
			const totalRecords = recordCount?.count;
			const response = new pagination(getCouponList,parseInt(totalRecords),parseInt(data.page),parseInt(data.page_size));
			res.send(setRes(resCode.OK,true,'Get Coupons successfully',(response.getPaginationInfo())))

		} else {
			res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		console.log(error)
		res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}


exports.getBusinessCouponList = async (req,res) => {
	try {
		const data = req.body;
		const arrayFields = ['page','page_size'];
		const requiredFields = _.reject(arrayFields,(o) => {return _.has(data,o);})
		const couponeModel = models.coupones;
		const businessModel = models.business
		// const userEmail = req.userEmail;
		const user = req?.user || {};
		const userEmail = user?.user;

		const skip = data.page_size * (data.page - 1)
		const limit = parseInt(data.page_size)
		if(requiredFields.length == 0) {
			if(data.page === '' || parseInt(data.page) < 0 || parseInt(data.page) === 0) {
				return res.send(setRes(resCode.BadRequest,false,"invalid page number, should start with 1",null))
			}
			if(data.page_size === '') {
				return res.send(setRes(resCode.BadRequest,false,"invalid page size",null))
			}
			if(data.business_id === '') {
				return res.send(setRes(resCode.BadRequest,false,"invalid business id",null))
			}

			const businessDetail = await businessModel.findOne({
				where: {email: userEmail,is_deleted: false,is_active: true}
			});
			if(businessDetail) {
				var condition = {
					attributes: {exclude: ['status','isDeleted','createdAt','updatedAt','deleted_at']},
					where: {
						business_id: businessDetail.id,
						isDeleted: false,
						status: 1,
					}
				};
				if(data.page_size != 0 && !_.isEmpty(data.page_size)) {
					condition.offset = skip,
						condition.limit = limit
				}
				const getCouponList = await couponeModel.findAll(condition);

				const recordCount = await couponeModel.findAndCountAll(condition);
				const totalRecords = recordCount?.count;
				const response = new pagination(getCouponList,totalRecords,parseInt(data.page),parseInt(data.page_size));
				res.send(setRes(resCode.OK,true,'Get Coupons successfully',(response.getPaginationInfo())))
			} else {
				return res.send(setRes(resCode.ResourceNotFound,false,"Business user not found",null))
			}

		} else {
			res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}


exports.removeUserCoupon = async (req,res) => {
	try {
		const data = req.params
		const userModel = models.user;
		const userCouponModel = models.user_coupons;
		// const userEmail = req.userEmail;
		const user = req?.user || {};
		const userEmail = user?.user;

		const requiredFields = _.reject(['id'],(o) => {return _.has(data,o)})
		if(requiredFields == "") {
			const userDetails = await userModel.findOne({
				where: {
					email: userEmail,
					is_deleted: false,
					is_active: true
				}
			});
			if(userDetails) {
				const userCouponDetails = await userCouponModel.findOne(
					{
						where: {id: data.id,is_deleted: false,deleted_at: null}
					});
				if(userCouponDetails) {
					const markDelete = await userCouponModel.update({
						is_deleted: true,
					},
						{
							where: {
								id: data.id
							}
						})
					if(markDelete) {
						const deleted = await userCouponModel.destroy({
							where: {
								id: data.id
							}
						});
						const removedCouponDetails = await userCouponModel.findOne(
							{
								where: {id: data.id}
							});
						res.send(setRes(resCode.OK,true,"Coupones removed successfully",removedCouponDetails))
					} else {
						res.send(setRes(resCode.BadRequest,false,"Coupon not found",null))
					}
				} else {
					res.send(setRes(resCode.ResourceNotFound,false,"Coupon not found",null))
				}
			} else {
				res.send(setRes(resCode.ResourceNotFound,false,"User not found",null))
			}
		} else {
			res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}
	} catch(error) {
		res.send(setRes(resCode.InternalServer,false,"Something went wrong!",null))
	}
}
// Update Reward coupones START