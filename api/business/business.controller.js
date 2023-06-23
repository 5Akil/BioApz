var mongoose = require('mongoose')
var async = require('async')
var crypto = require('crypto')
var EmailTemplates = require('swig-email-templates')
var nodemailer = require('nodemailer')
var path = require('path')
var resCode = require('../../config/res_code_config')
var setRes = require('../../response')
var jwt = require('jsonwebtoken');
var models = require('../../models')
var bcrypt = require('bcrypt')
var commonConfig = require('../../config/common_config')
var _ = require('underscore')
const Sequelize = require('sequelize');
var notification = require('../../push_notification')
var moment = require('moment')
const MomentRange = require('moment-range');
const Moment = MomentRange.extendMoment(moment);
var fs = require('fs');
var awsConfig = require('../../config/aws_S3_config');

exports.createInquiry = async (req, res) => {
	var data = req.body
	var dbModel = models.business_inquiry;
	var businessModel = models.business;
	var Op = models.Op

	var requiredFields = _.reject(['business_name', 'contact_person', 'email', 'phone', 'address', 'latitude', 'longitude', 'user_id', 'description'], (o) => { return _.has(data, o) })

	if (requiredFields == '') {
		businessModel.findOne({ where: { phone: data.phone } })

		businessModel.findOne({
			where: {
				[Op.or]: {
					phone: data.phone,
					email: data.email,
					business_name: data.business_name
				},
				is_deleted: false
			}
		}).then(business => {
			if (business != null) {
				if (business.phone == data.phone) {
					res.send(setRes(resCode.BadRequest, false, 'This phone number is already accociated with another account.', null));
				} else if (business.email == data.email) {
					res.send(setRes(resCode.BadRequest, false, 'This email is already accociated with another account.', null));
				} else {
					res.send(setRes(resCode.BadRequest, false, 'Business already registered on this business name.!', null));
				}
			}
			else {
				dbModel.findOne(
					{
						where: {
							is_deleted: false,
							[Op.or]: [
								{ email: data.email },
								{ phone: data.phone },
								{ business_name: data.business_name }
							]
						}
					}).then((inquiry) => {
						if (inquiry == null) {
							data.email = (data.email).toLowerCase();
							dbModel.create(data).then(function (inquiry) {
								if (inquiry) {
									res.send(setRes(resCode.OK, true, 'Business inquiry submitted successfully', inquiry));
								} else {
									res.send(setRes(resCode.BadRequest, false, 'Fail to create inquiry', null));
								}
							});
						}
						else {
							if (inquiry.email == data.email) {
								res.send(setRes(resCode.BadRequest, false, 'Inquiry already created on this email.', null));
							}
							else if (inquiry.phone == data.phone) {
								res.send(setRes(resCode.BadRequest, false, 'Inquiry already created on this number.', null));
							}
							else if (inquiry.business_name == data.business_name) {
								res.send(setRes(resCode.BadRequest, false, 'Inquiry already created on this business name.', null));
							}
							else {
								res.send(setRes(resCode.InternalServer, false, 'Internal server error.', null));
							}
						}
					}).catch(inquiryError => {
						res.send(setRes(resCode.BadRequest, false, inquiryError.message, null));
					})
			}
		})

	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}

}

exports.GetRecommendedBusiness = async (req, res) => {

	// console.log(req.body)
	var data = req.body;
	var business = models.business;
	var category = models.business_categorys;
	var rating = models.ratings;
	var template = models.templates;
	var Op = models.Op
	//0 - recomended, 1 - restaurent, 2 - cloth
	var whereCategory = {}
	if (data.type == 1 || data.type == 2) {
		whereCategory.id = data.type
	}


	var requiredFields = _.reject(['page', 'page_size', 'latitude', 'longitude', 'type'], (o) => { return _.has(data, o) })

	if (requiredFields == '') {

		if (data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1", null))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)

		//get distance by latitude longitude in km
		const query = '( 6371 * acos( cos( radians(' + data.latitude + ') ) * cos( radians( latitude ) ) * cos( radians( longitude ) - radians(' + data.longitude + ') ) + sin( radians(' + data.latitude + ') ) * sin( radians( latitude ) ) ) )'

		business.findAll({
			attributes: {
				include: [
					[Sequelize.literal(query), 'distance'],
					[Sequelize.fn('AVG', Sequelize.col('ratings.rating')), 'rating']
				]
			},
			// where: Sequelize.where(Sequelize.literal(query), '<=',50),
			include: [
				{
					model: rating,
					attributes: []
					// attributes : [[Sequelize.fn('AVG', Sequelize.col('rating')),'ratings']]
					// [models.sequelize.fn('count', '*'), 'count'] ]
				},
				{
					model: category,
					where: whereCategory,
				},
				// {
				// 	model: template
				// }
			],
			having: {
				distance: {
					[Op.lt]: 10000
				}
			},
			group: ['business.id'],
			order: Sequelize.col('distance'),
			offset: skip,
			limit: parseInt(limit),
			subQuery: false

		}).then((business) => {

			_.map(business, async (Obj) => {
				if (Obj.banner != null) {
					var banner = await awsConfig.getSignUrl(Obj.banner).then(function (res) {
						Obj.banner = res;
					});
				} else {
					Obj.banner = commonConfig.default_user_image;
				}
				// var template_url = await awsConfig.getSignUrl(Obj.template.image).then(function(res){
				// 	Obj.template.template_url = res
				// });
				return Obj;
				// return Obj.template.template_url = Obj.template.template_url.concat(`?bid=${Obj.id}&uid=${data.user_id}&ccd=${Obj.color_code}`)
			})

			// business.banner = awsConfig.getSignUrl(business.banner)
			res.send(setRes(resCode.OK, true, "Available businesses near you.", business))
		})
			.catch((err) => {
				res.send(setRes(resCode.InternalServer, false, "Internal server error", null))
			})

	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), true))
	}
}

exports.GetBusinessDetail = async (req, res) => {

	var data = req.body
	var businessModel = models.business
	var category = models.business_categorys;
	var rating = models.ratings;
	var template = models.templates;
	var Op = models.Op

	var requiredFields = _.reject(['business_id'], (o) => { return _.has(data, o) })
	if (requiredFields == '') {

		businessModel.findOne({
			where: {
				id: data.business_id,
				is_deleted: false,
				is_active: 1
			},
			attributes: {
				include: [
					[Sequelize.fn('AVG', Sequelize.col('ratings.rating')), 'rating']
				]
			},
			include: [
				{
					model: rating,
					attributes: []
				},
				{
					model: category,
				},
				// {
				// 	model: template
				// }
			],
		}).then(async business => {
			if (business != '' && business != null && business.id != null) {
				if (business.banner != null) {
					var business_banner = await awsConfig.getSignUrl(business.banner).then(function (res) {
						business.banner = res;
					})
				}
				else {
					business.banner = commonConfig.default_user_image;
				}

				// var business_template_template_url = await awsConfig.getSignUrl(business.template.image).then(function(res){
				// 	business.template.template_url = res
				// })
				// var business_template_image = await awsConfig.getSignUrl(business.template.image).then(function(res){
				// 	business.template.image = res
				// })
				res.send(setRes(resCode.OK, true, "Get business detail successfully.", business))
			} else {
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
			}

		}).catch(error => {
			res.send(setRes(resCode.BadRequest, false, "Fail to get business detail.", null))
		})

	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}

}

exports.GetBusinessProfile = async (req, res) => {

	var data = req.params
	var businessModel = models.business
	var categoryModel = models.business_categorys

	businessModel.findOne({
		where: {
			id: data.id,
			is_active:true,
			is_deleted: false
		},
		// attributes: ['id','auth_token','category_id','banner','person_name','business_name','email','phone','address','abn_no','account_name','account_number'],
		include: [categoryModel]
	}).then(async business => {
		if (business) {
			if (business.banner != null) {
				var business_banner = await awsConfig.getSignUrl(business.banner).then(function (res) {
					business.banner = res
				});
			}
			else {
				business.banner = commonConfig.default_image;
			}
			if (business.profile_picture != null) {
				var profile_picture = await awsConfig.getSignUrl(business.profile_picture).then(function (res) {
					business.profile_picture = res
				});
			}
			else {
				business.profile_picture = commonConfig.default_user_image;
			}
			res.send(setRes(resCode.OK, true, "Get business profile successfully.", business))
		}
		else {
			res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
		}
	}).catch(userError => {
		res.send(setRes(resCode.InternalServer, false, "Fail to get business profile.", null))
	})

}

exports.UpdateBusinessDetail = async (req, res) => {

	var data = req.body
	req.file ? data.banner = `${req.file.key}` : '';
	var businessModel = models.business
	var categoryModel = models.business_categorys
	var Op = models.Op;
	var requiredFields = _.reject(['id','business_name', 'person_name', 'abn_no', 'email', 'phone', 'description'], (o) => { return _.has(data, o) })
	var mailId = data.email;
	var emailFormat = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;

	if (requiredFields == '') {
		var mobilenumber = /^[0-9]+$/;
		if (mailId.match(emailFormat) == null) {
			res.send(setRes(resCode.BadRequest, false, 'Please enter valid email format.', null));
		}
		else if ((data.phone.length > 15) || (data.phone.length < 7) || !(mobilenumber.test(data.phone))) {
			res.send(setRes(resCode.BadRequest, false, 'Please enter valid mobile number.', null));
		} else {
			businessModel.findOne({
				where: { id: data.id, is_deleted: false, is_active: true }
			}).then(async businessDetail => {
				if (_.isEmpty(businessDetail)) {
					res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
				} else {
					businessModel.findOne({
						where: { is_deleted: false, business_name: { [Op.eq]: data.business_name }, id: { [Op.ne]: data.id } }
					}).then(async nameData => {
						if(nameData != null){
							res.send(setRes(resCode.BadRequest, false, "This business name is already associated with another account.!", null))
						}else{
							businessModel.findOne({
								where: { is_deleted: false, email: { [Op.eq]: data.email }, id: { [Op.ne]: data.id } }
							}).then(async emailData => {
								if (emailData == null) {
									businessModel.findOne({
										where: { is_deleted: false, phone: { [Op.eq]: data.phone }, id: { [Op.ne]: data.id } }
									}).then(async phoneData => {
										if (phoneData == null) {
											businessModel.update(data,
												{
													where: { id: data.id, is_deleted: false, is_active: true }
												}).then(async updateData => {
													if (data.banner != null) {
														const params = { Bucket: awsConfig.Bucket, Key: businessDetail.banner }; awsConfig.deleteImageAWS(params)
													}
													if (updateData == 1) {
														businessModel.findOne({
															where: { id: data.id, is_deleted: false, is_active: true },
															// attributes: ['id','auth_token','category_id','banner','person_name','business_name','email','phone','address','abn_no','account_name','account_number'],
														}).then(async dataDetail => {
															if (data.banner != null) {
																var updateData_image = await awsConfig.getSignUrl(data.banner).then(function (res) {
																	dataDetail.banner = res;
																})
															}else if(dataDetail.banner != null){
																var updateData_image = await awsConfig.getSignUrl(dataDetail.banner).then(function (res) {
																	dataDetail.banner = res;
																})
															}
															else {
																dataDetail.banner = awsConfig.default_image;
															}
															if (dataDetail.profile_picture != null) {
																var profile_picture = await awsConfig.getSignUrl(dataDetail.profile_picture).then(function (res) {
																	dataDetail.profile_picture = res
																});
															}
															else {
																dataDetail.profile_picture = commonConfig.default_user_image;
															}
															res.send(setRes(resCode.OK, true, 'Business profile update successfully', dataDetail))
														})
													} else {
														res.send(setRes(resCode.BadRequest, false, "Fail to update business.", null))
													}
												})
										} else {
											res.send(setRes(resCode.BadRequest, false, "This phone number is already associated with another account.!", null))
										}
									})
								} else {
									res.send(setRes(resCode.BadRequest, false, "This email is already associated with another account.!", null))
								}
							})
						}
					})
				}
			})
		}
	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}
}

exports.ChangePassword = async (req, res) => {

	var data = req.body
	var businessModel = models.business

	var requiredFields = _.reject(['id', 'old_password', 'new_password', 'confirm_password'], (o) => { return _.has(data, o) })

	if (requiredFields == "") {

		businessModel.findOne({
			where: {
				id: data.id,
				is_deleted: false,
				is_active: true
			}
		}).then(business => {
			if (business != null) {
				bcrypt.compare(data.old_password, business.password, function (error, isValid) {
					if (!error && isValid == true) {
						if (data.new_password == data.confirm_password){
							bcrypt.hash(data.new_password, 10).then(hash => {
								businessModel.update({
									password: hash
								}, {
									where: {
										id: data.id
									}
								}).then(updated => {
									if (updated == 1) {
										res.send(setRes(resCode.OK, true, 'Password updated successfully.', null))
									}
									else {
										res.send(setRes(resCode.BadRequest, false, "Fail to update password.", null))
									}
								})
							})
						}else{
							res.send(setRes(resCode.BadRequest, false, "New Password and confirem password not match.",null))
						}
					}
					else {
						res.send(setRes(resCode.BadRequest, false, "Old password not match.", null))
					}
				})
			}
			else {
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
			}
		})
	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}
}

exports.GetImages = async (req, res) => {
	var data = req.body
	var gallery = models.gallery;
	var businessModel = models.business;

	var requiredFields = _.reject(['business_id'], (o) => { return _.has(data, o) })
	if (requiredFields == '') {
		businessModel.findOne({
			where: {id: data.business_id,is_deleted: false,is_active: 1},
		}).then(async business => {
			if(business != null){
				gallery.findAll({
					where: {
						business_id: data.business_id,
						is_deleted: false
					}
				}).then(async gallery => {
					if (gallery != null && gallery != '') {
						for (const data of gallery) {
							const signurl = await awsConfig.getSignUrl(`${data.image}`).then(function (res) {
		
								data.image = res;
							});
						}
						res.send(setRes(resCode.OK, true, "Available images for your business.", gallery))
					}
					else {
						res.send(setRes(resCode.ResourceNotFound, false, "No images found for your business.", null))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
			}
		})
	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}
}

exports.UploadCompanyImages = async (req, res) => {
	var data = req.body
	var files = req.files
	var galleryModel = models.gallery;

	var requiredFields = _.reject(['business_id'], (o) => { return _.has(data, o) })
	if (requiredFields == '') {
		businessModel.findOne({
			where: {id: data.business_id,is_deleted: false,is_active: 1},
		}).then(async business => {
			if(business != null){
				if (files.length > 0) {
			var recordArray = []
			async.forEach(files, (singleFile, cbSingleFile) => {

				var row = {
					business_id: data.business_id,
					image: `${singleFile.key}`
				}
				recordArray.push(row)
				cbSingleFile()

			}, () => {
				if (recordArray.length > 0) {
					galleryModel.bulkCreate(recordArray).then(async gallery => {
						for (const data of gallery) {
							const signurl = await awsConfig.getSignUrl(`${data.image}`).then(function (res) {

								data.image = res;
							});
						}
						res.send(setRes(resCode.OK, true, 'images are uploded successfully.', gallery))
					}).catch(error => {
						res.send(setRes(resCode.BadRequest, false, "Fail to upload images.", null))
					})
				}
			})
		}else {
			res.send(setRes(resCode.BadRequest, false, "Please upload one or more file."), null)
		}
			}else{
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
			}
		})

	} else {
		console.log("in");
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}
}

exports.GetAllOffers = async (req, res) => {
	var offerModel = models.offers;
	var data = req.body
	var businessModel = models.business
	var categoryModel = models.business_categorys

	var requiredFields = _.reject(['page', 'page_size'], (o) => { return _.has(data, o) })

	if (requiredFields == '') {
		if (data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1"), null)
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)

		var condition = {
			offset: skip,
			limit: limit,
			subQuery: false,
			include: [
				{
					model: businessModel,
					include: [categoryModel]
				}
			],
			order: [
				['createdAt', 'DESC']
			]
		}
		data.business_id ? condition.where = { business_id: data.business_id, is_deleted: false } : condition.where = { is_deleted: false },

			offerModel.findAll(condition).then(async (offers) => {
				if (offers.length > 0) {
					for (offer of offers) {
						var offer_image = await awsConfig.getSignUrl(offer.image).then(function (res) {
							offer.image = res
						})
						if (offer.business.banner != null) {
							var offer_business_banner = await awsConfig.getSignUrl(offer.business.banner).then(function (res) {
								offer.business.banner = res
							})
						} else {
							offer.business.banner = commonConfig.default_user_image;
						}
					}
					res.send(setRes(resCode.OK, true, "Get offers list successfully", offers))
				} else {
					res.send(setRes(resCode.ResourceNotFound, false, "Offer not found", null))
				}
			})
				.catch((error) => {
					res.send(setRes(resCode.BadRequest, false, "Fail to get offers list", null))
				})
	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}
}

exports.UpdateOffer = (req, res) => {

	var data = req.body
	req.file ? data.image = `${req.file.key}` : '';
	var offerModel = models.offers

	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o) })

	data.repeat_every == 1 ? (data.repeat_on ? '' : requiredFields.push('repeat_on')) : '';

	_.contains([1, 2], parseInt(data.repeat_every)) ? data.repeat = true : '';

	if (requiredFields == '') {

		offerModel.findOne({
			where: {
				id: data.id,
				is_deleted: false
			}
		}).then(OfferData => {

			if (OfferData) {

				if (data.image) {

					const params = {
						Bucket: awsConfig.Bucket,
						Key: OfferData.image
					};
					awsConfig.deleteImageAWS(params)
				}

				offerModel.update(data, {
					where: {
						id: data.id,
						is_deleted: false
					}
				}).then(updatedOffer => {
					console.log(updatedOffer)
					if (updatedOffer > 0) {

						offerModel.findOne({
							where: {
								id: data.id,
								is_deleted: false
							}
						}).then(async offer => {
							var offer_image = await awsConfig.getSignUrl(offer.image).then(function (res) {
								offer.image = res
							})
							res.send(setRes(resCode.OK, true, "Offer updated successfully.", offer))
						}).catch(error => {
							console.log('===========update offer========')
							console.log(error.message)
							res.send(setRes(resCode.BadRequest, false, "Fail to update offer.", null))
						})

					}
				})

			} else {
				res.send(setRes(resCode.ResourceNotFound, false, "Offer not found !!", null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer, false, "Internal server error", null))
		})


	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}
}

exports.UpdateOfferDetail = async (req, res) => {

	var data = req.body
	req.file ? data.image = `${req.file.key}` : '';
	var offerModel = models.offers
	var productInqModel = models.product_inquiry;
	var userModel = models.user;

	if (data.id) {
		if (data.image) {
			offerModel.findOne({ where: { id: data.id, is_deleted: false } }).then(offerData => {
				const params = {
					Bucket: awsConfig.Bucket,
					Key: offerData.image
				};
				awsConfig.deleteImageAWS(params)
			});
		}
		offerModel.update(data, {
			where: {
				id: data.id,
				is_deleted: false
			}
		}).then(UpdatedOffer => {
			if (UpdatedOffer == 1) {

				offerModel.findOne({
					where: {
						id: data.id,
						is_deleted: false
					}
				}).then(async UpdatedOffer => {
					if (UpdatedOffer != null) {
						var UpdatedOffer_image = await awsConfig.getSignUrl(UpdatedOffer.image).then(function (res) {
							UpdatedOffer.image = res
						})
						res.send(setRes(resCode.OK, true, "Offer updated successfully.", UpdatedOffer))
					}
					else {
						res.send(setRes(resCode.BadRequest, false, "Fail to get offer.", null))
					}
				})
			}
			else {
				res.send(setRes(resCode.BadRequest, false, "Fail to update offer.", null))
			}
		}).catch(UpdateOfferError => {
			res.send(setRes(resCode.BadRequest, false, "Fail to update offer.", null))
		})
	}else {
		offerModel.create(data).then(async offer => {

			//send firebase notification to user
			var NotificationData = {};
			var Message = "Hey, you got an interesting offer, have you check ?";

			productInqModel.findAll({
				where: {
					business_id: offer.business_id
				},
				group: ['user_id']
			}).then(product_inquiries => {
				console.log(product_inquiries)
				product_inquiries = JSON.parse(JSON.stringify(product_inquiries))
				// console.log(product_inquiries)
				async.forEach(product_inquiries, function (singleInquery, cbSingleInquery) {
					// console.log('=======================')
					// console.log(singleInquery)

					userModel.findOne({
						where: {
							id: singleInquery.user_id,
							is_deleted: 0
						}
					}).then(user => {
						if (user != null && user.device_token != null) {
							NotificationData.device_token = user.device_token

							NotificationData.message = Message

							NotificationData.content = {
								offer: data.name,
							}
							notification.SendNotification(NotificationData)
						}
					})
				})
			})
			// console.log('++++++++++++++++++++++++');
			// console.log(NotificationData)


			// send notification code over
			var offer_image = await awsConfig.getSignUrl(offer.image).then(function (res) {
				offer.image = res
			})
			res.send(setRes(resCode.OK, true, "Offer added successfully.", offer))
		}).catch(error => {
			res.send(setRes(resCode.BadRequest, false, "Fail to add offer.", null))
		})
	}
}

exports.CreateOffer = async (req, res) => {

	var data = req.body
	req.file ? data.image = `${req.file.key}` : '';
	var offerModel = models.offers

	var requiredFields = _.reject(['business_id', 'name', 'description', 'repeat_every', 'end_date', 'start_date'], (o) => { return _.has(data, o) })

	data.repeat_every == 1 ? (data.repeat_on ? '' : requiredFields.push('repeat_on')) : '';

	_.contains([1, 2], parseInt(data.repeat_every)) ? data.repeat = true : '';

	var repeat_on_validation = _.reject(data.repeat_on, (v) => {
		return _.has([0, 1, 2, 3, 4, 5, 6], parseInt(v))
	})

	if (repeat_on_validation == '') {

		if (requiredFields == '') {

			var Offer = await createOffer(data)

			if (data.image != null) {
				Offer_image = await awsConfig.getSignUrl(data.image).then(function (res) {
					Offer.image = res
				})

			}
			if(Offer){
				res.send(setRes(resCode.OK, true, 'Offer created successfully.', Offer))
			}
			else {
				res.send(setRes(resCode.BadRequest, true, "Fail to create offer.", null))
			}

		} else {
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), true))
		}

	} else {
		res.send(setRes(resCode.BadRequest, false, "repeat_on value must between 0-6...", null))
	}
}

function createOffer(data) {
	var offerModel = models.offers

	return new Promise((resolve, reject) => {

		offerModel.create(data).then(offer => {
			if (offer != null) {
				resolve(offer);
			}
			else {
				resolve('')
			}
		})
			.catch(error => {
				resolve('')
			})

	})
}

exports.GetOffers = (req, res) => {

	var resObj = {}
	var data = req.body
	var offerModel = models.offers;
	var businessModel = models.business
	var categoryModel = models.business_categorys
	var Op = models.Op

	var requiredFields = _.reject(['business_id'], (o) => { return _.has(data, o) })

	if (requiredFields == '') {

		offerModel.update({
			is_deleted: true
		}, {
			where: {
				is_deleted: false,
				end_date: {
					[Op.lt]: moment().format('YYYY-MM-DD')
				}
			}
		}).then(updatedOffers => {

			offerModel.findAll({
				where: {
					business_id: data.business_id,
					is_deleted: false,
				},
				order: [
					['createdAt', 'DESC']
				],
				subQuery: false
			}).then(async offers => {
				_.each(offers, (o) => {



					let one = Moment.range(moment(`${data.from_date}T00:00:00.0000Z`), moment(`${data.to_date}T23:59:59.999Z`))

					let two = Moment.range(moment(`${o.start_date}T00:00:00.0000Z`), moment(`${o.end_date}T23:59:59.999Z`))

					let three = one.intersect(two)

					let four = three != null ? three.snapTo('day') : ''

					let five = three != null ? Array.from(three.by('days')) : ''

					_.each(five, (v) => {
						v = v.format('DD-MM-YYYY')
						if (o.repeat_every === 0) {
							if (v === moment(o.start_date).format('DD-MM-YYYY')) {
								_.has(resObj, v) === false ? resObj[v] = o : ''
							}
						} else if (o.repeat_every === 1) {
							var start = moment(o.start_date),
								end = moment(o.end_date),
								day = o.repeat_on.map(function (v) {
									return parseInt(v);
								});


							var now = start;

							while (now.isBefore(end) || now.isSame(end)) {
								if (v === moment(now).format('DD-MM-YYYY') && day.includes(moment(now, 'YYYY-MM-DD').day())) {
									_.has(resObj, v) === false ? resObj[v] = o : ''
								}
								now.add(1, 'days');
							}

						} else if (o.repeat_every === 2) {

							_.has(resObj, v) === false ? resObj[v] = o : ''

						}
					})
				})

				///////////////////////////////////

				// get N element from object
				let arrRes = []
				if (data.limit && data.limit > 0) {
					function firstN(obj, n) {
						return _.chain(obj)
							.keys()
							.sort()
							.take(n)
							.reduce(function (memo, current) {
								arrRes.push(obj[current]);
								return memo;
							}, {})
							.value();
					}

					firstN(resObj, data.limit)
				}
				//////////////////////////////////
				const offer = Object.keys(resObj)

				for (const offers of offer) {

					var resObj_offers_dataValues_image_url = await awsConfig.getSignUrl(resObj[offers].dataValues.image).then(function (res) {
						resObj[offers].dataValues.image_url = res
					})

				}

				res.send(setRes(resCode.OK, true, "Available Offers.", (data.limit ? arrRes : resObj)))
			})
				.catch(error => {
					console.log('============get offer error==========')
					console.log(error.message)
					res.send(setRes(resCode.InternalServer, false, "Internal server error", null))
				})

		}).catch(error => {
			console.log(error.message + ' ...business.controller');
			res.send(setRes(resCode.InternalServer, false, 'Internal server error.', null))
		})

	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}

}

exports.ManageBannerAndBooking = function (req, res) {

	var data = req.body
	req.file ? data.banner = `${req.file.key}` : '';
	var businessModel = models.business;

	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o) })

	if (requiredFields == '') {
		businessModel.update(data, {
			where: {
				id: data.id
			}
		}).then(updateBanner => {
			if (updateBanner == 1) {
				res.send(setRes(resCode.OK, true, "Banner updated successfully.", null))
			}
			else {
				res.send(setRes(resCode.BadRequest, false, "Fail to update banner.", null))
			}
		}).catch(UpdateBannerError => {
			res.send(setRes(resCode.BadRequest, false, "Fail to updated banner.", null))
		})
	}
	else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}
}

exports.GetCategory = async (req, res) => {

	var categoryModel = models.business_categorys;
	categoryModel.findAll({
		where: {
			is_deleted: false,
			status:true
		},
		order: [
			['createdAt', 'DESC']
		],
		attributes: {
			exclude: ['is_deleted','createdAt','updatedAt']
		  },
	}).then(categories => {
		if (categories != '' && categories != null) {
			for(const data of categories){
				data.dataValues.image = commonConfig.default_image
			}
			res.send(setRes(resCode.OK, true, "Get business category successfully..", categories))
		} else {
			res.send(setRes(resCode.ResourceNotFound, true, "Business category not found.", null))
		}

	}).catch(error => {
		res.send(setRes(resCode.BadRequest, false, "Fail to send request.", null))
	})
}

exports.CreateBusiness = async (req, res) => {
	var data = req.body
	req.file ? data.banner = `${req.file.key}` : '';
	// return false
	var validation = true;
	var businessModel = models.business
	var inquiryModel = models.business_inquiry
	var Op = models.Op
	var requiredFields = _.reject(['business_name', 'person_name', 'phone', 'category_id', 'email', 'password', 'abn_no', 'address', 'description', 'account_name', 'account_number', 'latitude', 'longitude'], (o) => { return _.has(data, o) })


	var mailId = data.email;
	var emailFormat = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
	var mobilenumber = /^[0-9]+$/;
	if (requiredFields == '') {
		if((data.business_name).length > 100){
			return res.send(setRes(resCode.BadRequest, false, 'Business name must be less than 100 characters',null));
		}
		if (mailId.match(emailFormat) == null) {
			res.send(setRes(resCode.BadRequest, false, 'Please enter valid email format.', null));
		}
		else if ((data.phone.length > 15) || (data.phone.length < 7) || !(mobilenumber.test(data.phone))) {
			res.send(setRes(resCode.BadRequest, false, 'Please enter valid mobile number.', null));
		}
		else {
			var nameData = await businessModel.findOne({
				where: { is_deleted: false, business_name: { [Op.eq]: data.business_name } }
			});

			if (nameData != null) {
				validation =false;
				return res.send(setRes(resCode.BadRequest, false, 'This business name is already associated with another account !', null))
			}

			var emailData = await businessModel.findOne({
				where: { is_deleted: false, email: { [Op.eq]: data.email } }
			});

			if (emailData != null) {
				validation =false;
				return res.send(setRes(resCode.BadRequest, false, 'This email is already associated with another account !', null))
			}

			var phoneData = await businessModel.findOne({
				where: { is_deleted: false, phone: { [Op.eq]: data.phone } }
			});

			if(phoneData != null){
				validation =false;
				return res.send(setRes(resCode.BadRequest, false, 'This phone number is already associated with another account !', null))
			}
			console.log(validation)
			if (validation) {
				data.email = (data.email).toLowerCase();
				data.is_active = false;
				await businessModel.create(data).then(async business => {

					if (data.id) {

						await inquiryModel.update({
							is_deleted: true
						}, {
							where: {
								id: data.id
							}
						}).then(inquiry => {
							if (inquiry > 0) {
								res.send(setRes(resCode.OK, true, "Business created successfully, please wait your account is under verification", business))
							}
							else {
								res.send(setRes(resCode.BadRequest, false, "Fail to remove Inquity.", null))
							}
						})

					}
					else {
						if (business.banner != null) {
							var business_banner = await awsConfig.getSignUrl(business.banner).then(function (res) {
								business.banner = res
							});
						}
						else {
							business.banner = commonConfig.default_image;
						}
						res.send(setRes(resCode.OK, true, "Business created successfully, please wait your account is under verification.", business))
					}
				}).catch(error => {
					res.send(setRes(resCode.BadRequest, false, error.message, null));
				})
			}
		}
	}
	else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}


	//   data = {
	// 	template_id: data.template_id,
	// 	business_name: data.business_name,
	// 	email: data.email,
	// 	password: data.password,
	// 	description: data.description,
	// 	person_name: data.person_name,
	// 	phone: data.phone,
	// 	category_id: data.category_id,
	// 	approve_by: data.approve_by,
	// 	abn_no: data.abn_no,
	// 	color_code: data.color_code,
	// 	sections: data.sections
	// // }
	// console.log(Joi.object())
	// var schema = Joi.object().keys({
	// 		mobile: Joi.string().regex(/^\d{3}-\d{3}-\d{4}$/).required(),
	// });
	// console.log(schema)


}

exports.ChatInitialize = async (req, res) => {
	var admin = require("firebase-admin");
	//var serviceAccount = require("../../bioapz-106c0-firebase-adminsdk-onfga-04682c17d2.json");
	var serviceAccount = require("../../bioapz-372208-4929769f6e43.json");

	!admin.apps.length ? admin.initializeApp({
		credential: admin.credential.cert(serviceAccount),
		//databaseURL: "https://bioapz-106c0-default-rtdb.firebaseio.com"
		databaseURL: "https://bioapz-372208-default-rtdb.firebaseio.com"
	}).firestore()
		: admin.app().firestore();


	var db = admin.database()

	var data = req.body
	var ProductInqModel = models.product_inquiry
	var userModel = models.user;
	var businessModel = models.business;

	var requiredFields = _.reject(['inquiry'], (o) => { return _.has(data, o) })

	if (requiredFields == '') {

		ProductInqModel.findOne({
			where: {
				id: data.inquiry,
				is_deleted: false
			},
			include: [{ all: true, nested: true }]
		}).then(proInquery => {

			if (proInquery != null) {

				var businessRef = db.ref(`businesses/${proInquery.business_id}/customer_ids`)
				var customerRef = db.ref(`customers/${proInquery.user_id}/business_ids`)
				var MessageChatRef = db.ref(`messages/business_${proInquery.business_id}_customer_${proInquery.user_id}/chat/${moment().unix()}_customer`)
				var MessageDetailRef = db.ref(`messages/business_${proInquery.business_id}_customer_${proInquery.user_id}/details`)

				businessRef.once('value', (fireBusinessData) => {
					fireBusinessData = JSON.parse(JSON.stringify(fireBusinessData))

					if (fireBusinessData != null) {
						console.log(fireBusinessData)
						var nextKey = parseInt(_.last(_.keys(fireBusinessData))) + 1

						//add user id in business array
						_.contains(fireBusinessData, proInquery.user_id) ? '' : businessRef.child(nextKey).set(proInquery.user_id)

						customerRef.once('value', async (fireCustomerData) => {
							fireCustomerData = JSON.parse(JSON.stringify(fireCustomerData))

							if (fireCustomerData != null) {
								var nextKey = parseInt(_.last(_.keys(fireCustomerData))) + 1

								//add business id in user array
								_.contains(fireCustomerData, proInquery.business_id) ? '' : customerRef.child(nextKey).set(proInquery.business_id)

								//add chat message in firebase database
								MessageChatRef.child('date').set(moment().toISOString())
								MessageChatRef.child('role').set('customer')
								MessageChatRef.child('sender_id').set(proInquery.user_id)
								MessageChatRef.child('text').set(proInquery.message)

								//update message detail in firebase database
								MessageDetailRef.child('date').set(moment().toISOString())
								MessageDetailRef.child('last_message').set(proInquery.message)

								//set chatInit in local database
								var InquiryDetailRes = await UpdateProInquiry
									(proInquery.id)

								InquiryDetailRes != null ? res.send(setRes(resCode.OK, InquiryDetailRes, true, "Chat Initialize Successfully..")) : res.send(setRes(resCode.InternalServer, null, false, "Fail to initialize chat."))
							}
							else {
								var setBusiness_ids = db.ref(`customers/${proInquery.user_id}`)

								//create new customer & add business id (for first time only)
								setBusiness_ids.child('business_ids').set({ 0: proInquery.business_id })
								setBusiness_ids.child('name').set(proInquery.user.username)

								//add chat message in firebase database
								MessageChatRef.child('date').set(moment().toISOString())
								MessageChatRef.child('role').set('customer')
								MessageChatRef.child('sender_id').set(proInquery.user_id)
								MessageChatRef.child('text').set(proInquery.message)

								//update message detail in firebase database
								MessageDetailRef.child('date').set(moment().toISOString())
								MessageDetailRef.child('last_message').set(proInquery.message)

								//set chatInit in local database
								var InquiryDetailRes = await UpdateProInquiry
									(proInquery.id)

								InquiryDetailRes != null ? res.send(setRes(resCode.OK, InquiryDetailRes, true, "Chat Initialize Successfully..")) : res.send(setRes(resCode.InternalServer, null, true, "Fail to initialize chat."))
							}

						})
					}
					else {
						console.log(fireBusinessData)

						var setCustomer_ids = db.ref(`businesses/${proInquery.business_id}`)

						//create new business & add user id (for first time only)
						setCustomer_ids.child('customer_ids').set({ 0: proInquery.user_id })
						setCustomer_ids.child('name').set(proInquery.business.business_name)

						customerRef.once('value', async (fireCustomerData) => {
							fireCustomerData = JSON.parse(JSON.stringify(fireCustomerData))

							if (fireCustomerData != null) {
								var nextKey = parseInt(_.last(_.keys(fireCustomerData))) + 1

								//add business id in user array
								_.contains(fireCustomerData, proInquery.business_id) ? '' : customerRef.child(nextKey).set(proInquery.business_id)

								//add chat message in firebase database
								MessageChatRef.child('date').set(moment().toISOString())
								MessageChatRef.child('role').set('customer')
								MessageChatRef.child('sender_id').set(proInquery.user_id)
								MessageChatRef.child('text').set(proInquery.message)

								//update message detail in firebase database
								MessageDetailRef.child('date').set(moment().toISOString())
								MessageDetailRef.child('last_message').set(proInquery.message)

								//set chatInit in local database
								var InquiryDetailRes = await UpdateProInquiry
									(proInquery.id)

								InquiryDetailRes != null ? res.send(setRes(resCode.OK, InquiryDetailRes, true, "Chat Initialize Successfully..")) : res.send(setRes(resCode.InternalServer, null, true, "Fail to initialize chat."))
							}
							else {
								var setBusiness_ids = db.ref(`customers/${proInquery.user_id}`)

								//create new customer & add business id (for first time only)
								setBusiness_ids.child('business_ids').set({ 0: proInquery.business_id })
								setBusiness_ids.child('name').set(proInquery.user.username)

								//add chat message in firebase database
								MessageChatRef.child('date').set(moment().toISOString())
								MessageChatRef.child('role').set('customer')
								MessageChatRef.child('sender_id').set(proInquery.user_id)
								MessageChatRef.child('text').set(proInquery.message)

								//update message detail in firebase database
								MessageDetailRef.child('date').set(moment().toISOString())
								MessageDetailRef.child('last_message').set(proInquery.message)

								//set chatInit in local database
								var InquiryDetailRes = await UpdateProInquiry
									(proInquery.id)

								InquiryDetailRes != null ? res.send(setRes(resCode.OK, InquiryDetailRes, true, "Chat Initialize Successfully..")) : res.send(setRes(resCode.InternalServer, null, true, "Fail to initialize chat."))
							}

						})

					}

				})

			}
			else {
				res.send(setRes(resCode.BadRequest, false, "Inquiry not found.", null))
			}

		}).catch(getProductInqError => {
			res.send(setRes(resCode.InternalServer, false, getProductInqError.message, null))
		})

	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}
}

function UpdateProInquiry(inquiryId) {
	var ProductInqModel = models.product_inquiry

	return new Promise((resolve, reject) => {
		ProductInqModel.update({
			chat_init: 1
		}, {
			where: {
				id: inquiryId,
				is_deleted: 0
			}
		}).then(inquiry => {
			if (inquiry == 1) {
				ProductInqModel.findOne({
					where: {
						id: inquiryId,
						is_deleted: 0
					}
				}).then(UpdatedInquiry => {
					if (UpdatedInquiry != '') {
						resolve(UpdatedInquiry)
						// res.send(setRes(resCode.OK, UpdatedInquiry , true, "Chat Initialize Successfully.."))
					}
					else {
						resolve(null)
						// res.send(setRes(resCode.InternalServer, null, true, "Fail to get inquiry."))		
					}
				}).catch(GetInquiryError => {
					resolve(null)
					// res.send(setRes(resCode.BadRequest, null, true, GetInquiryError))
				})

			} else {
				resolve(null)
				// res.send(setRes(resCode.InternalServer, null, true, "Fail to initialize chat."))
			}
		}).catch(error => {
			resolve(null)
			// res.send(setRes(resCode.BadRequest, null, true, error))
		})
	})
}

exports.RestaurantsBooking = (req, res) => {

	console.log(req.body)
	var data = req.body
	var ProductInqModel = models.product_inquiry;
	var businessModel = models.business;
	var userModel = models.user

	var requiredFields = _.reject(['user_id', 'business_id', 'date', 'time'], (o) => { return _.has(data, o) })

	if (requiredFields == '') {

		userModel.findOne({
			where: {
				id: data.user_id,
				is_deleted: false,
				is_active: true
			}
		}).then((users) => {
			if (users != null) {

				var BookingDetail = {
					product_id: 0,
					business_id: data.business_id,
					user_id: data.user_id,
					type: 2,
					date: data.date,
					time: data.time,
					name: users.username,
					email: users.email,
					phone: users.mobile,
					address: users.address,
					latitude: users.latitude,
					longitude: users.longitude,
					message: null,

				}

				ProductInqModel.create(BookingDetail).then(async function (booking) {
					if (booking) {

						//send firebase notification to business user
						var NotificationData = {};
						var InquiryMessage = "Someone want to know about your products.";
						var BookingMessage = "Someone has requested for booking";

						await businessModel.findOne({
							where: {
								id: booking.business_id
							}
						}).then(business => {
							if (business != null && business.device_token != null) {

								NotificationData.device_token = business.device_token
								NotificationData.message = BookingMessage

								NotificationData.content = {
									name: booking.name,
									email: booking.email,
									date: booking.date,
									time: booking.time
								}
								// console.log('++++++++++++++++++++++++');
								// console.log(NotificationData)
								notification.SendNotification(NotificationData)
							}
						})
						// send notification code over

						res.send(setRes(resCode.OK, true, 'Booking created successfully.', booking));
					} else {
						res.send(setRes(resCode.BadRequest, false, 'Fail to create Booking.', null));
					}
				});
			}
			else {
				res.send(setRes(resCode.BadRequest, false, 'Fail to create Booking.', null));
			}
		})
	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}

}

// Home Page API START
exports.homeList = async (req, res) => {
	try {
		var data = req.query
		var giftCardModel = models.gift_cards
		var cashbackModel = models.cashbacks
		var discountModel = models.discounts
		var couponeModel = models.coupones
		var loyaltyPointModel = models.loyalty_points
		var combocalenderModel = models.combo_calendar
		var businessModel = models.business;
		var Op = models.Op;
		const promises = [];
		var eventArray = [];

		promises.push(
			giftCardModel.findAll({
				where: { business_id:data.business_id,isDeleted: false, status: true, deleted_at: null }
			}).then(async giftCardData => {
				if (giftCardData.length > 0) {
					const dataArray = [];
					// Update Sign URL
					for (const data of giftCardData) {
						if (data.image != null) {
							var images = data.image
							const signurl = await awsConfig.getSignUrl(images.toString()).then(function (res) {
								data.image = res;
							});
						} else {
							data.image = commonConfig.default_image;
						}
						let result = JSON.parse(JSON.stringify(data));
						if(result.expire_at < currentDate){
							result.expire_status = 1;
						}else{
							result.expire_status = 0;
						}
						result.type = "gift_cards";
						dataArray.push(result);
					}
					return dataArray;
				}
				return [];
			}),
			cashbackModel.findAll({
				where: { business_id:data.business_id,isDeleted: false, status: true, deleted_at: null }
			}).then(async CashbackData => {
				if (CashbackData.length > 0) {
					const dataArray = [];
					for (const data of CashbackData) {
						let result = JSON.parse(JSON.stringify(data));
						if(result.validity_for < currentDate){
							result.expire_status = 1;
						}else{
							result.expire_status = 0;
						}
						result.type = "cashbacks";
						dataArray.push(result);
					}
					return dataArray;
				}
				return [];
			}),
			discountModel.findAll({
				where: { business_id:data.business_id,isDeleted: false, status: true, deleted_at: null }
			}).then(async DiscountData => {
				if (DiscountData.length > 0) {
					const dataArray = [];
					for (const data of DiscountData) {
						let result = JSON.parse(JSON.stringify(data));
						if(result.validity_for < currentDate){
							result.expire_status = 1;
						}else{
							result.expire_status = 0;
						}
						result.type = "discounts";
						dataArray.push(result);
					}
					return dataArray;
				}
				return [];
			}),
			couponeModel.findAll({
				where: { business_id:data.business_id,isDeleted: false, status: true, deleted_at: null }
			}).then(async CouponeData => {
				if (CouponeData.length > 0) {
					const dataArray = [];
					for (const data of CouponeData) {
						let result = JSON.parse(JSON.stringify(data));
						if(result.expire_at < currentDate){
							result.expire_status = 1;
						}else{
							result.expire_status = 0;
						}
						result.type = "coupones";
						dataArray.push(result);
					}
					return dataArray;

				}
				return [];
			}),
			loyaltyPointModel.findAll({
				where: { business_id:data.business_id,isDeleted: false, status: true, deleted_at: null }
			}).then(async LoyaltyPointData => {
				if (LoyaltyPointData.length > 0) {
					const dataArray = [];
					for (const data of LoyaltyPointData) {
						let result = JSON.parse(JSON.stringify(data));
						if(result.validity < currentDate){
							result.expire_status = 1;
						}else{
							result.expire_status = 0;
						}
						result.type = "loyalty_points";
						dataArray.push(result);
					}
					return dataArray;

				}
				return [];
			}),
		);
		const [giftcardRewards, cashbackData, discountData, couponeData, loyaltyData] = await Promise.all(promises);
		const rewardsAndLoyaltyArray = [giftcardRewards, cashbackData, discountData, couponeData, loyaltyData];
		const mergedArray = mergeRandomArrayObjects(rewardsAndLoyaltyArray);
		let result = mergedArray.slice(0, 5);

		eventArray.push(
			combocalenderModel.findAll({
				where: { is_deleted: false,business_id:data.business_id}
			}).then(async event => {
				if(event.length > 0){
					const dataArray = [];	
					for (const data of event) {
						var event_images = data.images
						var image_array = [];
						if(event_images != null){
							for(const data of event_images){
								const signurl = await awsConfig.getSignUrl(data).then(function(res){
									  image_array.push(res);
								});
							}
						}else{
							image_array.push(commonConfig.default_image)
						}
						data.dataValues.event_images = image_array
					}
					var array = shuffle(event);
					var slicedArray = array.slice(0, 5);
					let result = 	JSON.parse(JSON.stringify(slicedArray));
					dataArray.push(result);
					return result;
				}
				return [];
			})
		);
		
		const [eventsData] = await Promise.all(eventArray);
		const eventDataArray = eventsData;

		let resData = {};
		resData.total_sale = "";
		resData.total_ongoing = "";
		resData.total_products = "";
		resData.rewards_and_loyalty = result;
		resData.events = eventDataArray;

		res.send(setRes(resCode.OK, true, "Get home page details successfully.",resData))
	} catch (error) {
		console.log(error)
		res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null))
	}
}

function mergeRandomArrayObjects(arrays) {
	const shuffledArrays = _.shuffle(arrays);
	const mergedArray = [];

	_.each(shuffledArrays, function (array) {
		_.each(array, function (obj) {
			_.extend(obj, { random: Math.random() });
			mergedArray.push(obj);
		});
	});
	return mergedArray;
}

function shuffle(array) {
	let currentIndex = array.length,  randomIndex;
  
	// While there remain elements to shuffle.
	while (currentIndex != 0) {
  
	  // Pick a remaining element.
	  randomIndex = Math.floor(Math.random() * currentIndex);
	  currentIndex--;
  
	  // And swap it with the current element.
	  [array[currentIndex], array[randomIndex]] = [
		array[randomIndex], array[currentIndex]];
	}
  
	return array;
}
// Home Page API END


exports.getUserProfile = async (req, res) => {
	try {
		var data = req.params
		var businessModel = models.business
		var categoryModel = models.business_categorys

		businessModel.findOne({
			where: {
				id: data.id,
				is_active: true,
				is_deleted: false
			},
			// attributes: ['id', 'person_name', 'profile_picture', 'phone', 'email', 'address', 'abn_no', 'business_name', 'password','auth_token']
		}).then(async business => {
			if (business) {
				if (business.profile_picture != null) {
					var business_profile = await awsConfig.getSignUrl(business.profile_picture).then(function (res) {
						business.profile_picture = res
					});
				}
				else {
					business.profile_picture = commonConfig.default_user_image;
				}
				if (business.banner != null) {
					var business_profile = await awsConfig.getSignUrl(business.banner).then(function (res) {
						business.banner = res
					});
				}
				else {
					business.banner = commonConfig.default_image;
				}
				res.send(setRes(resCode.OK, true, "Get business user profile successfully.", business))
			}
			else {
				res.send(setRes(resCode.ResourceNotFound, false, "Business user not found.", null))
			}
		}).catch(userError => {
			res.send(setRes(resCode.BadRequest, false, "Fail to get business profile.", null))
		})
	} catch (error) {
		console.log(error)
		res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null))
	}

}

exports.updateUserDetils = async (req, res) => {
	try {
		var data = req.body
		req.file ? data.profile_picture = `${req.file.key}` : '';
		var businessModel = models.business
		var Op = models.Op;
		var requiredFields = _.reject(['id'], (o) => { return _.has(data, o) })
		var mailId = data.email;
		var validation = true;
		var emailFormat = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;

		if (requiredFields == '') {
			var mobilenumber = /^[0-9]+$/;
			if (!_.isEmpty(data.phone)) {
				if ((data.phone.length > 15) || (data.phone.length < 7) || !(mobilenumber.test(data.phone))) {
					return res.send(setRes(resCode.BadRequest, false, 'Please enter valid phone number.', null));
				}
			}
			if (!_.isEmpty(data.email)) {
				if (mailId.match(emailFormat) == null) {
					return res.send(setRes(resCode.BadRequest, false, 'Please enter valid email format.', null));
				}
			}
			businessModel.findOne({
				where: { id: data.id, is_deleted: false, is_active: true }
			}).then(async businessDetail => {
				if (_.isEmpty(businessDetail)) {
					res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
				} else {

					await businessModel.findOne({
						where: { is_deleted: false, business_name: { [Op.eq]: data.business_name }, id: { [Op.ne]: data.id } }
					}).then(async nameData => {
						if (nameData != null) {
							validation =false;
							return res.send(setRes(resCode.BadRequest, false, 'This business name is already associated with another account !', null))
						}
					})

					await businessModel.findOne({
						where: { is_deleted: false, email: { [Op.eq]: data.email }, id: { [Op.ne]: data.id } }
					}).then(async emailData => {
						if (emailData != null) {
							validation =false;
							return res.send(setRes(resCode.BadRequest, false, 'This email is already associated with another account !', null))
						}
					})

					await businessModel.findOne({
						where: { is_deleted: false, phone: { [Op.eq]: data.phone }, id: { [Op.ne]: data.id } }
					}).then(async phoneData => {
						if(phoneData != null){
							validation =false;
							return res.send(setRes(resCode.BadRequest, false, 'This phone number is already associated with another account !', null))
						}
					})
					if (validation) {
						await businessModel.update(data,
							{
								where: { id: data.id, is_deleted: false, is_active: true }
							}).then(async updateData => {
								if (updateData == 1) {
									businessModel.findOne({
										where: { id: data.id, is_deleted: false, is_active: true },
										// attributes: ['id', 'person_name', 'profile_picture', 'phone', 'email', 'address', 'abn_no', 'business_name', 'password','auth_token']
									}).then(async dataDetail => {
										if (data.profile_picture != null) {
											const params = { Bucket: awsConfig.Bucket, Key: businessDetail.profile_picture }; awsConfig.deleteImageAWS(params);
											var updateData_image = await awsConfig.getSignUrl(data.profile_picture).then(function (res) {
												dataDetail.profile_picture = res;
											})
										} else if (dataDetail.profile_picture != null) {
											var old_image = await awsConfig.getSignUrl(dataDetail.profile_picture).then(function (res) {
												dataDetail.profile_picture = res;
											})
										}
										else {
											dataDetail.profile_picture = commonConfig.default_user_image;
										}
										if (data.banner != null) {
											const params = { Bucket: awsConfig.Bucket, Key: businessDetail.banner }; awsConfig.deleteImageAWS(params);
											var updateData_image = await awsConfig.getSignUrl(data.banner).then(function (res) {
												dataDetail.banner = res;
											})
										} else if (dataDetail.banner != null) {
											var old_image = await awsConfig.getSignUrl(dataDetail.banner).then(function (res) {
												dataDetail.banner = res;
											})
										}
										else {
											dataDetail.banner = commonConfig.default_image;
										}
										res.send(setRes(resCode.OK, true, 'Business user profile updated successfully.', dataDetail))
									})
								} else {
									res.send(setRes(resCode.BadRequest, false, "Fail to update business.", null))
								}
							})
					}
					
				}
			})
		} else {
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
		}
	} catch (error) {
		console.log(error)
		res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null))
	}
}