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

exports.createInquiry = async (req, res) => {
	
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
						res.send(setRes(resCode.OK, true, "Inquiry created successfully.",inquiry))
						
					} else {
						res.send(setRes(resCode.BadRequest, false, "Fail to create inquiry.",null))
						
					}
				}).catch(error => {
					res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
					
				})
		// 	}
		// 	else{
		// 		res.send(setRes(resCode.BadRequest, null, true, 'Inquiry already created on this email'));
		// 	}
		// })
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		
	}
}


exports.GetAllProducts = async (req, res) => {

	var productModel = models.products;
	var business = models.business;
	var category = models.business_categorys;
	var product_category = models.product_categorys
	var productRattingModel = models.product_ratings
	var categoryModel = models.product_categorys
	var data = req.body
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
			],
			include:[
				{
					model:productRattingModel,
					attributes: []
				},
				{
			        model: categoryModel,
			        as: 'product_categorys',
			        attributes:['name']
			    },
			    {
			        model: categoryModel,
			        as: 'sub_category',
			        attributes:['name']
			    }
			],
			attributes: { include : [
				[Sequelize.fn('AVG', Sequelize.col('product_ratings.ratings')),'rating']
			]},
			group: ['products.id'],
		}
		condition.where = {business_id:data.business_id,category_id:data.category_id}
		if(data.sub_category_id) {
			condition.where = {business_id:data.business_id,category_id:data.category_id,sub_category_id:data.sub_category_id}
		}
		
		productModel.findAll(condition).then(async(products) => {
			if (products.length > 0){
				for(const data of products){
				  var product_images = data.image
						var image_array = [];
					
							for(const data of product_images){
								const signurl = await awsConfig.getSignUrl(data).then(function(res){

			  						image_array.push(res);
								});
								
							}
						data.dataValues.product_images = image_array
						data.dataValues.category_name = data.product_categorys.name
						data.dataValues.product_type = data.sub_category.name

						delete data.dataValues.product_categorys
						delete data.dataValues.sub_category
				}
				res.send(setRes(resCode.OK, true, "Get product list successfully",products))
				
			}else{
				res.send(setRes(resCode.ResourceNotFound,false, "Products not found",null))
				
			}
		})
		.catch((error) => {
			res.send(setRes(resCode.InternalServer,false, "Fail to get product list",null))
			
		})
	}else{
		
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
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
						res.send(setRes(resCode.OK,true, "Available booking for your business.",bookings))
						
					}else{
						res.send(setRes(resCode.OK,true, "No Booking available for your business.",bookings))
						
					}

				}).catch((calenderError) => {
					res.send(setRes(resCode.InternalServer,false, "Get booking error.",null))
					
				})

			}else{
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.",null))
			}

		}).catch((error) => {
			res.send(setRes(resCode.InternalServer, false, "get business error.",null))
		})
		
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
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
							res.send(setRes(resCode.OK,true, "Product inquiry is readed..",UpdatedInquiry))
						}
						else{
							res.send(setRes(resCode.InternalServer,false, "Fail to get inquiry.",null))		
						}
					}).catch(GetInquiryError => {
						res.send(setRes(resCode.BadRequest,false, GetInquiryError,null))
					})
					
				}else{
					res.send(setRes(resCode.InternalServer,false, "Fail to read inquiry.",null))
				}
			}).catch(error => {
				res.send(setRes(resCode.BadRequest,false, error,null))
			})

		}else{
			res.send(setRes(resCode.BadRequest,false, (requiredFields.toString() + ' are required'),null))
		}

}

exports.createProduct = async(req,res) => {
	try{

		var data = req.body
		var filesData = req.files;
		var validation = true;
		var requiredFields = _.reject(['business_id','category_id','name','price','description'], (o) => { return _.has(data, o)  })
		if(requiredFields == ""){

				if(filesData.length == 0){
					res.send(setRes(resCode.BadRequest,false, 'At least one image is required for product',null))
					validation = false;
				}else if(filesData.length > 5){
					validation = false;
					res.send(setRes(resCode.BadRequest,false, 'You can upload only 5 images',null))
				}
				if(filesData.length !=0 && filesData.length <= 5){
					for(const image of filesData){
						const fileContent = await fs.promises.readFile(image.path);
						const fileExt = `${image.originalname}`.split('.').pop();
						if(image.size > commonConfig.maxFileSize){
							validation = false;
							res.send(setRes(resCode.BadRequest,false, 'You can upload only 5 mb files, some file size is too large',null))
						}else if (!commonConfig.allowedExtensions.includes(fileExt)) {
						  // the file extension is not allowed
						  validation = false;
						  res.send(setRes(resCode.BadRequest, false, 'You can upload only jpg, jpeg, png, gif files',null))
						}
					}

				}
				var productModel = models.products
				if(validation){
					productModel.create(data).then(async function(product)  {
						const lastInsertId = product.id;
						if(lastInsertId){
							var files = [];
							for(const file of filesData){
								
								const fileContent = await fs.promises.readFile(file.path);
								const fileExt = `${file.originalname}`.split('.').pop()
								const randomString = Math.floor(Math.random() * 1000000); 
								const fileName = `${Date.now()}_${randomString}.${fileExt}`;
								const params = {
						       Bucket: awsConfig.Bucket,
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
									productModel.findOne({where:{id:lastInsertId}}).then(async getData => {
										var product_images = getData.image
										var image_array = [];
										for(const data of product_images){
											const signurl = await awsConfig.getSignUrl(data).then(function(res){

						  						image_array.push(res);
											});
										}
										getData.dataValues.product_images = image_array
										
										res.send(setRes(resCode.OK,true,"Product created successfully",getData))
									})
								}else{
									res.send(setRes(resCode.InternalServer,false,"Image not update",getData))
								}
							})
						}
					
					}).catch(error => {
						res.send(setRes(resCode.BadRequest,false, "Fail to add product or service.",null))
					})

				}
		}else{
			res.send(setRes(resCode.BadRequest,false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}

}
exports.UpdateProductDetail = async (req, res) => {

	var data = req.body
	
	var productModel = models.products

	const row = await productModel.findByPk(data.id);
	const image = row.image;
	
	if (data.id){
		if(req.files){

				const filesData = req.files;
				const total_image = image.length + filesData.length;
				var validation = true

				if(total_image > 5){
					validation = false
					res.send(setRes(resCode.BadRequest,false, "You cannot update more than 5 images.You already uploaded "+image.length+" images",null))
				}
				for(const imageFile of filesData){
						const fileContent = await fs.promises.readFile(imageFile.path);
						const fileExt = `${imageFile.originalname}`.split('.').pop();
						if(imageFile.size > commonConfig.maxFileSize){
							validation = false;
							res.send(setRes(resCode.BadRequest,false, 'You can upload only 5 mb files, some file size is too large',null))
						}else if (!commonConfig.allowedExtensions.includes(fileExt)) {
						  // the file extension is not allowed
						  validation = false;
						  res.send(setRes(resCode.BadRequest,false, 'You can upload only jpg, jpeg, png, gif files',null))
						}
				}
				if(validation){

					var files = [];
					for(const file of filesData){
						const fileContent = await fs.promises.readFile(file.path);
						const fileExt = `${file.originalname}`.split('.').pop()
						const randomString = Math.floor(Math.random() * 1000000); 
						const fileName = `${Date.now()}_${randomString}.${fileExt}`;
						const params = {
				       Bucket: awsConfig.Bucket,
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
					const oldFilenames = image.join(';');
					
					
					if(images != ""){
						const allFilenames = `${oldFilenames};${images}`;
						data.image = allFilenames
					}
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
				}).then(async UpdatedProduct => {
					if (UpdatedProduct != null){
						var product_images = UpdatedProduct.image
						var image_array = [];
						for(const data of product_images){
							const signurl = await awsConfig.getSignUrl(data).then(function(res){

		  						image_array.push(res);
							});
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

exports.GetProductById =  (req, res) => {

	data = req.params
	var productModel = models.products
	var productRattingModel = models.product_ratings
	var categoryModel = models.product_categorys

	 productModel.findOne({
		where: {
			id: data.id,
			is_deleted: false
		},
		include:[
			{
				model:productRattingModel,
				attributes: []
			},
			{
		        model: categoryModel,
		        as: 'product_categorys',
		        attributes:['name']
		    },
		    {
		        model: categoryModel,
		        as: 'sub_category',
		        attributes:['name']
		    }

		],
		attributes: { include : [
			[Sequelize.fn('AVG', Sequelize.col('product_ratings.ratings')),'rating']
		]},
	}).then(async product => {
		if (product.length > 0){
			
			var product_images = product.image
			var image_array = [];
			for(const data of product_images){
				const signurl = await awsConfig.getSignUrl(data).then(function(res){
					image_array.push(res);
				});
			}
			
			product.dataValues.product_images = image_array
			product.dataValues.category_name = product.product_categorys.name
			product.dataValues.product_type = product.sub_category.name

			delete product.dataValues.product_categorys
			delete product.dataValues.sub_category
			res.send(setRes(resCode.OK, true, "Get product detail successfully.",product))
			
		}
		else{
			res.send(setRes(resCode.ResourceNotFound,false, "Product not found.",null))
			// res.send(setRes(resCode.ResourceNotFound, null, true, "Resource not found."))

		}
	}).catch(GetProductError => {
		res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
		
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
						    Bucket: awsConfig.Bucket,
						    Key: data.image_name
						};
						awsConfig.deleteImageAWS(params)

						productModel.findOne({
							where: {
								id: data.id
							}
						}).then(async product => {
							var product_images = product.image
							var image_array = [];
							for(const data of product_images){
								const signurl = await awsConfig.getSignUrl(data).then(function(res){

			  						image_array.push(res);
								});
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
exports.CreateCategory = async (req, res) => {
 
	var data = req.body
	req.file ? data.image = `${req.file.key}`: '';
	var productCategoryModel = models.product_categorys

	var requiredFields = _.reject(['business_id','name','image','parent_id'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		productCategoryModel.create(data).then(async categoryData => {

			if(categoryData){
				var image = await awsConfig.getSignUrl(data.image).then(function(res){
					data.image = res
				})
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
	var pageination = req.body

	var productCategoryModel = models.product_categorys

	var requiredFields = _.reject(['page','page_size'], (o) => { return _.has(pageination, o)  })
	if(requiredFields == ""){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
		}
		var skip = pageination.page_size * (pageination.page - 1)
		var limit = parseInt(pageination.page_size)

		productCategoryModel.findAll({
			where:{
				business_id:data.id,
				is_deleted: false,
				is_enable: true,
				parent_id:0
			},
			offset:skip,
			limit:limit,
			order: [
				['createdAt', 'DESC']
			]
		}).then(async categoryData => {
			if (categoryData != '' && categoryData != null ){
				// Update Sign URL
				for(const data of categoryData){
				  const signurl = await awsConfig.getSignUrl(data.image).then(function(res){

				  	data.image = res;		  
				  });
				}
					res.send(setRes(resCode.OK, categoryData, false, "Get category detail successfully.."))
				}else{
					res.send(setRes(resCode.ResourceNotFound, null, false, "Category not found."))
				}
				
			}).catch(error => {
				res.send(setRes(resCode.BadRequest, error, true, "Fail to send request."))
			})	
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}

exports.GetCategoryById = async(req, res) => {

	var data = req.params
	var productCategoryModel = models.product_categorys

	productCategoryModel.findOne({
		where:{
			id:data.id,
			is_deleted:false,
			is_enable:true,
		}
	}).then(async categoryData => {
		if (categoryData != null){
			
			var categoryData_image = await awsConfig.getSignUrl(categoryData.image).then(function(res){
				categoryData.image = res;
			})
			res.send(setRes(resCode.OK, categoryData, false, "Get category detail successfully."))
		}
		else{
			res.send(setRes(resCode.ResourceNotFound, null, true, "Category not found."))
		}
	}).catch(GetCategoryError => {
		res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
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
								    Bucket: awsConfig.Bucket,
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
						}}).then(async categoryDetail => {
							var categoryDetail_image = await awsConfig.getSignUrl(categoryDetail.image).then(function(res){
								categoryDetail.image = res;
							})
							res.send(setRes(resCode.OK,categoryDetail,false,'Category update successfully'))
						})
					}else{
						res.send(setRes(resCode.BadRequest, null, true, "Fail to update category or service."))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound,null,true,"Category not found"))
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

exports.ProductTypeList = async(req, res) => {

	var data = req.body;
	var categoryModel = models.product_categorys
	var Op = models.Op;

	var requiredFields = _.reject(['business_id','category_id','page','page_size'], (o) => { return _.has(data, o) })
	if(requiredFields == ""){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
		categoryModel.findAll({

			where:{
				business_id : data.business_id,
				parent_id : data.category_id,
				is_deleted: false,
				is_enable: true
			},
			offset:skip,
			limit:limit,
			order: [
				['createdAt', 'DESC']
			]
		}).then(async subCategoryData => {
			if (subCategoryData != '' && subCategoryData != null ){
			// Update Sign URL
			for(const data of subCategoryData){
			  const signurl = await awsConfig.getSignUrl(data.image).then(function(res){

			  	data.image = res;		  
			  });
			}
				res.send(setRes(resCode.OK, subCategoryData, false, "Get product type  details successfully.."))
			}else{
				res.send(setRes(resCode.ResourceNotFound, null, false, "Product type not found."))
			}
		}).catch(error => {
			res.send(setRes(resCode.BadRequest, error, true, "Fail to send request."))
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))		
	}
}

exports.removeProductType = async(req, res) => {

	var data = req.params
	var productCategoryModel = models.product_categorys
	var cartModel = models.shopping_cart
	var orderDetailsModel = models.order_details
	var wishlistModel = models.wishlists
	var productModel = models.products
	var Op = models.Op;

	productModel.findAll({
		where:{
			sub_category_id:data.id,
			is_deleted:false
		}
	}).then(productData => {
		
		var product_ids = [];
		for(const data of productData){
			product_ids.push(data.id)
		}
		cartModel.findAll({
			where:{
				product_id:{
					[Op.in]:product_ids
				},
				is_deleted:false
			}
		}).then(cartData => {
			if(cartData.length > 0){
				res.send(setRes(resCode.BadRequest,null,true,"You can not delete this category because some product of this sub-category are into some user carts"))
			}else{
				
				wishlistModel.findAll({
					where:{
						product_id:{
							[Op.in]:product_ids
						},
						is_deleted:false
					}
				}).then(wishlistData => {

					if(wishlistData.length > 0){
						res.send(setRes(resCode.BadRequest,null,true,"You can not delete this category because some product of this sub-category are into some user wishlist"))
					}else{

						orderDetailsModel.findAll({
							where:{
								product_id:{
									[Op.in]:product_ids
								},
								is_deleted:false,
								order_status:1
							}
						}).then(orderData => {

							if(orderData.length > 0){
								res.send(setRes(resCode.BadRequest,null,true,"You can not delete this category because some ongoing order of this sub-category product"))
							}else{
								productCategoryModel.findOne({
									where:{
										id:data.id,
										is_deleted:false,
										is_enable:true
									}
								}).then(subCategoryData => {

									if(subCategoryData != null){

										subCategoryData.update({is_deleted:true})
										res.send(setRes(resCode.OK,null,false,"Product type deleted successfully"))
									}else{
										res.send(setRes(resCode.ResourceNotFound,null,false,"Product type not found"))
									}
								})
							}
						})
					}
				})
			}
		})			
	}).catch(error => {
		res.send(setRes(resCode.BadRequest, error, true, "Internal server error."))
	})
}

exports.AddProductRattings = async(req,res) => {

	var data = req.body
	var productRattingModel = models.product_ratings
	var requiredFields = _.reject(['user_id','product_id','ratings','description'], (o) => { return _.has(data, o) })

	if(requiredFields == ""){

		productRattingModel.findOne({
			where:{
				user_id:data.user_id,
				product_id:data.product_id,
				is_deleted:false
			}
		}).then(rattingData => {
			if(rattingData != null){
				productRattingModel.update(data,{where:
					{
						user_id:data.user_id,
						product_id:data.product_id
					}
				}).then(updateData=>{

					if(updateData == 1){

						productRattingModel.findOne({
							where:{
								product_id : data.product_id,
								user_id : data.user_id,
								is_deleted: false
							}
						}).then(rattingDetails => {
							res.send(setRes(resCode.OK,rattingDetails,false,"Product ratting update successfully"))
						})
					}else{
						res.send(setRes(resCode.InternalServer,null,true,"Internal server error"))
					}
				})
			}else{
				productRattingModel.create(data).then(addRattingData => {

					res.send(setRes(resCode.OK,addRattingData,false,"Product ratting save successfully"))
				})
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,null,true,"Fail to add product ratting"))
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}

exports.GetProductRattings = async(req,res)=>{

	var data = req.body
	var productRattingModel = models.product_ratings
	var userModel = models.user
	var requiredFields = _.reject(['product_id','page','page_size'], (o) => { return _.has(data, o) })

	if(requiredFields == ""){

		productRattingModel.findAll({
			where:{
				product_id : data.product_id,
				is_deleted : false
			},
			include:{
				model:userModel
			},
			order: [
				['createdAt', 'DESC']
			],
			attributes: { exclude: ['is_deleted', 'updatedAt'] }
		}).then(async ratingData => {

			for(const data of ratingData){

				data.dataValues.user_name = data.user.username
				if(data.user.profile_picture != null){
					const signurl = await awsConfig.getSignUrl(data.user.profile_picture).then(function(res){
						data.dataValues.profile_picture = res
					})
				}else{
					data.dataValues.profile_picture = null
				}
				data.dataValues.ratings = data.ratings
				data.dataValues.review = data.description

				delete data.dataValues.user
				delete data.dataValues.description
			}
			res.send(setRes(resCode.OK,ratingData,false,'Get ratings successfully'))
		}).catch(error => {
			res.send(setRes(resCode.InternalServer, null,true,'Fail to get ratings'))
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))	
	}
}