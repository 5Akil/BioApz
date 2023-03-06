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
var _ = require('underscore')
var moment = require('moment')
const Sequelize = require('sequelize');
var notification = require('../../push_notification')
var awsConfig = require('../../config/aws_S3_config')

exports.createInquiry = async (req, res) => {

  console.log(req.body)
  var data = req.body
  var dbModel = models.product_inquiry;
  var businessModel = models.business;

  var requiredFields = _.reject(['name', 'email', 'phone', 'address', 'latitude', 'longitude', 'user_id', 'message', 'type'], (o) => { return _.has(data, o)  })

 	 if (requiredFields == ''){

		// dbModel.findOne({where: {email: data.email, is_deleted: false}}).then((inquiry) => {
		// 	if (inquiry == null){
				dbModel.create(data).then(async function (inquiry) {
					if (inquiry) {

						//send firebase notification to business user
						var NotificationData = {};
						var InquiryMessage = "Someone want to know about your products.";
						var BookingMessage = "Someone has requested for booking";

						await businessModel.findOne({
							where: {
								id: inquiry.business_id
							}
						}).then(business => {
							if (business != null && business.device_token != null){
								
								NotificationData.device_token = business.device_token

								inquiry.type == 1 ? NotificationData.message = InquiryMessage : NotificationData.message = BookingMessage

								NotificationData.content = {
									name: data.name,
									email: data.email,
									date: data.date,
									time: data.time
								}
								// console.log('++++++++++++++++++++++++');
								// console.log(NotificationData)
								notification.SendNotification(NotificationData)
							}
						})
						// send notification code over

						res.send(setRes(resCode.OK, inquiry, false, 'Inquiry created successfully.'));
					} else {
						res.send(setRes(resCode.BadRequest, null, true, 'Fail to create inquiry'));
					}
				}).catch(error => {
					res.send(setRes(resCode.InternalServer, error.message, true, "Internal server error."))
				})
		// 	}
		// 	else{
		// 		res.send(setRes(resCode.BadRequest, null, true, 'Inquiry already created on this email'));
		// 	}
		// })
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}

}


exports.GetAllProducts = async (req, res) => {

	var productModel = models.products;
	var business = models.business;
	var category = models.business_categorys;
	var data = req.body
	console.log(req.body)
	var requiredFields = _.reject(['page','page_size'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = data.page_size
		
		var condition = {
			offset:skip,
			limit : limit,
			subQuery:false,
			include: [
				// { all: true, nested: true }
				{
					model: business,
					include: [category]
				}
			],
			order: [
				['createdAt', 'DESC']
			]
		}
		data.business_id ? condition.where = {business_id:data.business_id, is_deleted: false} : condition.where = {is_deleted: false},

		productModel.findAll(condition).then((products) => {
			if (products.length > 0){
				for(const data of products){
				  const signurl = awsConfig.getSignUrl(`${data.image}`);
				  data.image = signurl;		  
				}
				res.send(setRes(resCode.OK, products, false, "Get product list successfully"))
			}else{
				res.send(setRes(resCode.OK, products, false, "Get product list successfully"))
			}
		})
		.catch((error) => {
			res.send(setRes(resCode.BadRequest, null, true, "Fail to get product list"))
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}

}


exports.GetBookingInquiry = async (req, res) => {

	//   console.log(req.body)
	var data = req.body
	var businessModel = models.business;
	var calenderModel  = models.product_inquiry;
	var Op = models.Op

	var requiredFields = _.reject(['business'], (o) => { return _.has(data, o)  })

		if (requiredFields == ''){

		businessModel.findOne({
			where:{
				id: data.business,
				is_active: 1,
				is_deleted: 0
			}
		}).then((business) => {

			// console.log(business)
			if (business != ''){
				calenderModel.findAll({
					where:{
						business_id: data.business,
						is_deleted: 0,
						date: {
							[Op.between]: [moment(new Date(data.from_date)).format('YYYY-MM-DD'), moment(new Date(data.to_date)).format('YYYY-MM-DD')]
						}
					},
					order: [
						['date', 'DESC'],
						['time', 'DESC'],
					],
				}).then((bookings) => {
					// console.log(bookings)
					if (bookings != ''){
						res.send(setRes(resCode.OK, bookings, false, 'Available booking for your business.'))
					}else{
						res.send(setRes(resCode.OK, bookings, false, 'No Booking available for your business.'))
					}

				}).catch((calenderError) => {
					console.log(calenderError)
					res.send(setRes(resCode.InternalServer, null, true, 'get booking error.'))
				})

			}else{
				res.send(setRes(resCode.ResourceNotFound, null, true, "Business not found."))
			}

		}).catch((error) => {
			res.send(setRes(resCode.InternalServer, null, true, "get business error."))
		})
		
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
	
}

exports.IsReadStatus = async (req, res) => {
	var data = req.body
	var ProductInqModel = models.product_inquiry

	var requiredFields = _.reject(['inquiry'], (o) => { return _.has(data, o)  })

		if (requiredFields == ''){

			ProductInqModel.update({
				is_read: 1
			},{
				where: {
					id: data.inquiry,
					is_deleted: 0
				}
			}).then(inquiry => {
				if (inquiry == 1){
					ProductInqModel.findOne({
						where: {
							id: data.inquiry,
							is_deleted: 0
						}
					}).then(UpdatedInquiry => {
						if (UpdatedInquiry != ''){
							res.send(setRes(resCode.OK, UpdatedInquiry , false, "Product inquiry is readed.."))
						}
						else{
							res.send(setRes(resCode.InternalServer, null, true, "Fail to get inquiry."))		
						}
					}).catch(GetInquiryError => {
						res.send(setRes(resCode.BadRequest, null, true, GetInquiryError))
					})
					
				}else{
					res.send(setRes(resCode.InternalServer, null, true, "Fail to read inquiry."))
				}
			}).catch(error => {
				res.send(setRes(resCode.BadRequest, null, true, error))
			})

		}else{
			res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
		}

}

exports.UpdateProductDetail = async (req, res) => {

	var data = req.body
	req.file ? data.image = `${req.file.key}`: '';
	var productModel = models.products

	if (data.id){

		productModel.findOne({
			where: {
				id: data.id,
				is_deleted: false
			}
		}).then(productData => {
			if(data.image){
		
					const params = {
								    Bucket: 'bioapz',
								    Key: productData.image
								};
					awsConfig.deleteImageAWS(params)
				}
		});
		productModel.update(data,{
			where: {
				id: data.id,
				is_deleted: false
			}
		}).then(UpdatedProduct => {
			if (UpdatedProduct == 1){

				productModel.findOne({
					where: {
						id: data.id,
						is_deleted: false
					}
				}).then(UpdatedProduct => {
					if (UpdatedProduct != null){
						UpdatedProduct.image = awsConfig.getSignUrl(UpdatedProduct.image);
						res.send(setRes(resCode.OK, UpdatedProduct, false, "Product Or Service updated successfully."))
					}
					else{
						res.send(setRes(resCode.BadRequest, null, true, "Fail to update product or service."))		
					}
				})
			}
			else{
				res.send(setRes(resCode.BadRequest, null, true, "Fail to update product or service."))
			}
		}).catch(UpdateProductError => {
			res.send(setRes(resCode.BadRequest, null, true, "Fail to updated product or service."))
		})
	}
	else{
		productModel.create(data).then(product => {
			product.image = awsConfig.getSignUrl(product.image);
			res.send(setRes(resCode.OK, product, false, "Product Or Service added successfully."))
		}).catch(error => {

			res.send(setRes(resCode.BadRequest, null, true, "Fail to add product or service."))
		})
	}
}

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

exports.GetProductById = (req, res) => {

	data = req.body
	var productModel = models.products

	productModel.findOne({
		where: {
			id: data.product_id,
			is_deleted: false
		}
	}).then(product => {
		if (product != null){
			product.image = awsConfig.getSignUrl(product.image)
			res.send(setRes(resCode.OK, product, false, "Get product detail successfully."))
		}
		else{
			res.send(setRes(resCode.ResourceNotFound, null, true, "Resource not found."))
		}
	}).catch(GetProductError => {
		res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
	})

}
