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
const fs = require('fs');
var multer = require('multer');
const multerS3 = require('multer-s3');

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
	var product_category = models.product_categorys
	var data = req.body
	console.log(req.body)
	var requiredFields = _.reject(['page','page_size','business_id'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
		
		var condition = {
			offset:skip,
			limit : limit,
			subQuery:false,
			order: [
				['createdAt', 'DESC']
			]
		}
		
		if(data.product_search){
			condition.where = {business_id:data.business_id,name: `%${data.product_search}%`,is_deleted: false}			
		}
		// data.product_search ? condition.where = {business_id:data.business_id,name: `%${data.product_search}%`,is_deleted: false} :condition.where = {is_deleted: false},
		data.business_id ? condition.where = {business_id:data.business_id, is_deleted: false} : condition.where = {is_deleted: false},

		productModel.findAll(condition).then((products) => {
			if (products.length > 0){
				for(const data of products){
				  var product_images = data.image
						var image_array = [];
					
							for(const data of product_images){
								const signurl = awsConfig.getSignUrl(data);
			  				image_array.push(signurl);
							}
						data.dataValues.product_images = image_array	  
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

exports.createProduct = async(req,res) => {
	try{

		var data = req.body
		var filesData = req.files;
		var requiredFields = _.reject(['business_id','category_id','name','price','description'], (o) => { return _.has(data, o)  })
		if(requiredFields == ""){

				if(filesData.length == 0){
					res.send(setRes(resCode.BadRequest, null, true, 'At least one image is required for product'))					
				}

				var productModel = models.products
				productModel.create(data).then(async function(product)  {
					const lastInsertId = product.id;
					if(lastInsertId){
						var files = [];
						var buffer_img = [];
						for(const file of filesData){
							
							const fileContent = await fs.promises.readFile(file.path);
							const fileExt = `${file.originalname}`.split('.').pop()
							const randomString = Math.floor(Math.random() * 1000000); 
							const fileName = `${Date.now()}_${randomString}.${fileExt}`;
							const params = {
					       Bucket: 'bioapz',
					       Key: `products/${lastInsertId}/${fileName}`,
					       Body: fileContent,
			     		};

						  const result = await awsConfig.s3.upload(params).promise();
						  if(result){
								files.push(`products/${lastInsertId}/${fileName}`)
								fs.unlinkSync(file.path)

			     		}				  
						}
						var image = files.join(';');
						productModel.update({
							image: image
						},{
							where: {
								id: lastInsertId,
								
							}
						}).then(productData => {
							if(productData){
								productModel.findOne({where:{id:lastInsertId}}).then(getData => {
									var product_images = getData.image
									var image_array = [];
									for(const data of product_images){
										const signurl = awsConfig.getSignUrl(data);
					  				image_array.push(signurl);
									}
									getData.dataValues.product_images = image_array
									
									res.send(setRes(resCode.OK,getData,null,"Product created successfully"))
								})
							}else{
								res.send(setRes(resCode.InternalServer,getData,null,"Image not update"))
							}
						})
					}
				
				}).catch(error => {
					res.send(setRes(resCode.BadRequest, error, true, "Fail to add product or service."))
				})
		}else{
			res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest, null, true, "Something went wrong!"))
	}

}
exports.UpdateProductDetail = async (req, res) => {

	var data = req.body
	
	var productModel = models.products

	if (data.id){

		if(req.files){
				const filesData = req.files;
				var files = [];
				for(const file of filesData){
					const fileContent = await fs.promises.readFile(file.path);
					const fileExt = `${file.originalname}`.split('.').pop()
					const randomString = Math.floor(Math.random() * 1000000); 
					const fileName = `${Date.now()}_${randomString}.${fileExt}`;
					const params = {
			       Bucket: 'bioapz',
			       Key: `products/${data.id}/${fileName}`,
			       Body: fileContent,
	     		};

	     		const result = await awsConfig.s3.upload(params).promise();
				  if(result){
						files.push(`products/${data.id}/${fileName}`)
						fs.unlinkSync(file.path)
					}
				}
				var images = files.join(';');
				const row = await productModel.findByPk(data.id);
				const image = row.image;
				const oldFilenames = image.join(';');
				
				
				if(images != ""){
					const allFilenames = `${oldFilenames};${images}`;
					data.image = allFilenames
				}
			}
		
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
						var product_images = UpdatedProduct.image
						var image_array = [];
						for(const data of product_images){
							const signurl = awsConfig.getSignUrl(data);
		  				image_array.push(signurl);
						}
						UpdatedProduct.dataValues.product_images = image_array
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
		res.send(setRes(resCode.BadRequest, null, true, ('id is required')))
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

	data = req.params
	var productModel = models.products

	productModel.findOne({
		where: {
			id: data.id,
			is_deleted: false
		}
	}).then(product => {
		if (product != null){
			// product.image = awsConfig.getSignUrl(product.image)
			var product_images = product.image
			var image_array = [];
			for(const data of product_images){
				const signurl = awsConfig.getSignUrl(data);
				image_array.push(signurl);
			}
			product.dataValues.product_images = image_array
			res.send(setRes(resCode.OK, product, false, "Get product detail successfully."))
		}
		else{
			res.send(setRes(resCode.ResourceNotFound, null, true, "Resource not found."))
		}
	}).catch(GetProductError => {
		res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
	})

}

exports.RemoveProductImage = async(req, res) => {

	var data = req.body
	var productModel = models.products

	var requiredFields = _.reject(['id','image_name'], (o) => { return _.has(data, o) })
	if(requiredFields == ""){

		if (data.image_name) {

			productModel.findOne({
				where: {
					id: data.id,
					is_deleted: false
				}
			}).then(productData => {

				// console.log(JSON.parse(JSON.stringify(comboOffer)))
				var replaceImages = _.filter(productData.image, (img) => {

						return img != data.image_name
					})
				var new_images = replaceImages.join(';')
				productModel.update({
					image: new_images
				},{
					where : {
						id: data.id
					}
				}).then(updatedProduct => {
					
					if (updatedProduct > 0) {
						const params = {
						    Bucket: 'bioapz',
						    Key: data.image_name
						};
						awsConfig.deleteImageAWS(params)

						productModel.findOne({
							where: {
								id: data.id
							}
						}).then(product => {
							var product_images = product.image
							var image_array = [];
							for(const data of product_images){
								const signurl = awsConfig.getSignUrl(data);
			  				image_array.push(signurl);
							}
							product.dataValues.product_images = image_array
							res.send(setRes(resCode.OK, product, false, "Product .."))
						})
					}

				}).catch(error => {
					res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
				})

			}).catch(error => {
				res.send(setRes(resCode.InternalServer, null, true, "Fail to remove image from product."))
			})

		} else {
			res.send(setRes(resCode.BadRequest, null, true, "Invalid image name..."))
		}
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}
exports.CreateCategory = (req, res) => {
 
	var data = req.body
	req.file ? data.image = `${req.file.key}`: '';
	var productCategoryModel = models.product_categorys

	var requiredFields = _.reject(['business_id','name','image'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		productCategoryModel.create(data).then(categoryData => {

			if(categoryData){
				data.image = awsConfig.getSignUrl(data.image)
				res.send(setRes(resCode.OK,data,false,"Category added successfully"))
			}else{
				res.send(setRes(resCode.InternalServer,null,true,"Internal server error"))
			}
		})
	}else {
			res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}

}

exports.CategoryList = async(req, res) => {

	var data = req.params
	var productCategoryModel = models.product_categorys

	productCategoryModel.findAll({
		where:{
			business_id:data.id,
			is_deleted: false,
			is_enable: true
		}
	}).then(categoryData => {
		if (categoryData != '' && categoryData != null ){
			// Update Sign URL
			for(const data of categoryData){
			  const signurl = awsConfig.getSignUrl(data.image);
			  data.image = signurl;		  
			}
				res.send(setRes(resCode.OK, categoryData, false, "Get category detail successfully.."))
			}else{
				res.send(setRes(resCode.ResourceNotFound, null, false, "Category not found."))
			}
			
		}).catch(error => {
			res.send(setRes(resCode.BadRequest, error, true, "Fail to send request."))
	})	
}

exports.UpdateCategory = async(req, res) => {

	var data = req.body
	req.file ? data.image = `${req.file.key}`: '';
	var productCategoryModel = models.product_categorys

	if(data.id){

		productCategoryModel.findOne({
			where:{
				id:data.id,is_deleted:false,is_enable:true
			}
		}).then(categoryData => {
			if(categoryData != null){

				if(data.image){
		
					const params = {
								    Bucket: 'bioapz',
								    Key: categoryData.image
								};
					awsConfig.deleteImageAWS(params)
				}
				productCategoryModel.update(data,{
					where: {
						id: data.id,
						is_deleted: false,
						is_enable: true
					}
				}).then(updateData => {
					if(updateData == 1){
						productCategoryModel.findOne({
							where:{id: data.id,
							is_deleted: false,
							is_enable: true
						}}).then(categoryDetail => {
							categoryDetail.image = awsConfig.getSignUrl(categoryDetail.image)
							res.send(setRes(resCode.OK,categoryDetail,false,'Category update successfully'))
						})
					}else{
						res.send(setRes(resCode.BadRequest, null, true, "Fail to update category or service."))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound,null,true,"Data not found"))
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, ('id are required')))
	}
}

exports.RemoveCategory = async(req, res) => {

	var data = req.params
	
	var productCategoryModel = models.product_categorys
	var cartModel = models.shopping_cart
	var orderDetailsModel = models.order_details
	var wishlistModel = models.wishlists

	if(data.id){

		cartModel.findAll({
			where:{
				category_id:data.id,
				is_deleted:false
			}
		}).then(cartData => {

			if(cartData.length > 0 ){
				res.send(setRes(resCode.BadRequest,null,true,"You can not delete this category because some product of this category into user cart"))
			}else{

				orderDetailsModel.findAll({
					where:{
						category_id:data.id,
						is_deleted:false,
						order_status:1
					}
				}).then(orderData => {
					if(orderData.length > 0){
						res.send(setRes(resCode.BadRequest,null,true,"You can not delete this category because some ongoing order of this category product"))
					}else{

						wishlistModel.findAll({
							where:{
								category_id:data.id,
								is_deleted:false,
								
							}
						}).then(wishlistData => {

							if(wishlistData.length > 0){
								res.send(setRes(resCode.BadRequest,null,true,"You can not delete this category because some product of this category into user wishlists"))
							}else{

								productCategoryModel.findOne({
									where:{
										id:data.id,
										is_deleted:false,
										is_enable:true
									}
								}).then(categoryData => {

									if(categoryData != null){

										categoryData.update({is_deleted:true})
										res.send(setRes(resCode.OK,null,false,"Category deleted successfully"))
									}else{
										res.send(setRes(resCode.ResourceNotFound,null,false,"Category not found"))
									}
								})
							}
						})
					}
				})
			}
		})
	}else{
		res.send(setRes.BadRequest,null,true,"id is require")
	}

}