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
const { condition } = require('sequelize')

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
	var Op = models.Op
	var categoryModel = models.product_categorys
	var data = req.body
	var requiredFields = _.reject(['page','page_size','business_id','category_id'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}

		var totalRecords = null

		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
		
		var condition2 = {
			subQuery:false,
			order: [
				['createdAt', 'DESC'	],
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
		condition2.where = {...condition2.where,...{business_id:data.business_id,category_id:data.category_id,is_deleted:false,}}
		condition2.attributes = { exclude:['createdAt','updatedAt']}
		if(!_.isEmpty(data.price)){
			if(data.price == 1){
				condition2.order = Sequelize.literal('price DESC')
			}else{
				condition2.order = Sequelize.literal('price ASC')
			}
		}

		if(data.search && data.search != null && !_.isEmpty(data.search)){
			condition2.where = {...condition2.where,...{[Op.or]: [{name: {[Op.like]: "%" + data.search + "%",}}],}}
		} 

		if(data.sub_category_id) {
			condition2.where = {...condition2.where,...{business_id:data.business_id,category_id:data.category_id,sub_category_id:data.sub_category_id}}
		}

		await productModel.findAll(condition2).then(async(CartList) => {
			totalRecords = CartList.length
		})

		var condition = {
			subQuery:false,
			order: [
				['createdAt', 'DESC'	],
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
		condition.where = {...condition.where,...{business_id:data.business_id,category_id:data.category_id,is_deleted:false,}}
		condition.attributes = { exclude:['createdAt','updatedAt']}
		if(!_.isEmpty(data.price)){
			if(data.price == 1){
				condition.order = Sequelize.literal('price DESC')
			}else{
				condition.order = Sequelize.literal('price ASC')
			}
		}

		if(data.search && data.search != null && !_.isEmpty(data.search)){
			condition.where = {...condition.where,...{[Op.or]: [{name: {[Op.like]: "%" + data.search + "%",}}],}}
		} 

		if(data.sub_category_id) {
			condition.where = {...condition.where,...{business_id:data.business_id,category_id:data.category_id,sub_category_id:data.sub_category_id}}
		}

		if(data.page_size != 0 && !_.isEmpty(data.page_size)){
			condition.offset = skip,
			condition.limit = limit
		}
	
		await productModel.findAll(condition).then(async(products) => {
			
			if (products){
				for(const data of products){
					
				  	var product_images = data.image

					var image_array = [];
						
							if(product_images != null){

								for(const data of product_images){
									const signurl = await awsConfig.getSignUrl(data).then(function(res){

				  						image_array.push(res);
									});
									
								}
							}else{
								image_array.push(commonConfig.default_image)
							}
						
					data.dataValues.product_images = image_array
					if(data.product_categorys != null){

						data.dataValues.category_name = data.product_categorys.name
						delete data.dataValues.product_categorys
					}else{
						data.dataValues.category_name = ""
					}
					if(data.sub_category != null){

						data.dataValues.product_type = data.sub_category.name
						delete data.dataValues.sub_category
					}else{
						data.dataValues.product_type = "";
					}

				}
				const previous_page = (data.page - 1);
				const last_page = Math.ceil(totalRecords / data.page_size);
				var next_page = null;
				if(last_page > data.page){
					var pageNumber = data.page;
					pageNumber++
					next_page = pageNumber;
				}

				var response = {};
				response.totalPages = (data.page_size != 0) ? Math.ceil(totalRecords/limit) : 1;
				response.currentPage = parseInt(data.page);
				response.per_page =  (data.page_size != 0) ? parseInt(data.page_size) : totalRecords;
				response.total_records = totalRecords;
				response.data = products;
				response.previousPage = (previous_page == 0) ? null : previous_page ;
				response.nextPage = next_page;
				response.lastPage = last_page;

				res.send(setRes(resCode.OK, true, "Get product list successfully",response))
				
			}
		})
		.catch((error) => {
			res.send(setRes(resCode.InternalServer,false, error,null))
			
		})
	}else{
		
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}

}


exports.GetBookingInquiry = async (req, res) => {
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
					if (bookings != ''){
						res.send(setRes(resCode.OK,true, "Available booking for your business.",bookings))
						
					}else{
						res.send(setRes(resCode.OK,true, "No Booking available for your business.",bookings))
						
					}

				}).catch((calenderError) => {
					res.send(setRes(resCode.InternalServer,false, "Internal server error.",null))
					
				})

			}else{
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.",null))
			}

		}).catch((error) => {
			res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
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
							res.send(setRes(resCode.BadRequest,false, "Fail to get inquiry.",null))		
						}
					}).catch(GetInquiryError => {
						res.send(setRes(resCode.InternalServer,false, "Internal server error.",null))
					})
					
				}else{
					res.send(setRes(resCode.BadRequest,false, "Fail to read inquiry.",null))
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
		var businessModel = models.business
		var categoryModel = models.product_categorys
		var productModel = models.products
		var Op = models.Op
		var requiredFields = _.reject(['business_id','category_id','sub_category_id','name','price','description'], (o) => { return _.has(data, o)  })
		if (requiredFields == "") {
			if(data.name && !_.isEmpty == data.name){
				var name = data.name;
				var validname = /^[A-Z+_a-z+_0-9 ]+$/;
				if (name.match(validname) == null) {
						return res.send(setRes(resCode.BadRequest, false, 'Please enter valid product name.', null));
				}
			}

			if(data.name && !_.isEmpty(data.name)){
				const condition = {};
				condition.where= {is_deleted:false,business_id:data.business_id,category_id:data.category_id,
					name: {
						[Op.eq]: data.name}
					};
					if(data.sub_category_id){
						condition.where = {...condition.where,...{sub_category_id:data.sub_category_id}}
					}
				const existCategory = await productModel.findOne(condition);
				if(existCategory){
					validation = false;
					return res.send(setRes(resCode.BadRequest, false, 'This product name is already exists with this category!',null))
				}
			}


			if (data.category_id) {
				await categoryModel.findOne({
					where: {
						id: data.category_id,
						is_enable: true,
						is_deleted: false,
						parent_id:{
							[Op.eq] : 0,
						}
					}
				}).then(async productCategory => {
					if (productCategory == null) {
						validation = false;
						return res.send(setRes(resCode.ResourceNotFound, false, "Product category not found.", null))
					}
				})
			}

			if(data.price && !_.isEmpty(data.price)){
				if(data.price <= 0 ){
					validation = false;
						return res.send(setRes(resCode.BadRequest, false, "Please enter price value more than 0.", null))
				}
			}

			if (data.sub_category_id) {
				await categoryModel.findOne({
					where: {
						id: data.sub_category_id,
						is_enable: true,
						is_deleted: false,
						parent_id:{
							[Op.ne] : 0,
						}
					}
				}).then(async productSubCategory => {
					if (productSubCategory == null) {
						validation = false;
						return res.send(setRes(resCode.ResourceNotFound, false, "Product type not found.", null))
					}
				})
			}

			if (filesData.length == 0) {
				res.send(setRes(resCode.BadRequest, false, 'At least one image is required for product', null))
				validation = false;
			} else if (filesData.length > 5) {
				validation = false;
				res.send(setRes(resCode.BadRequest, false, 'You can upload only 5 images', null))
			}
			if (filesData.length != 0 && filesData.length <= 5) {
				for (const image of filesData) {
					const fileContent = await fs.promises.readFile(image.path);
					const fileExt = `${image.originalname}`.split('.').pop();
					if (image.size > commonConfig.maxFileSize) {
						validation = false;
						res.send(setRes(resCode.BadRequest, false, 'You can upload only 5 mb files, some file size is too large', null))
					} else if (!commonConfig.allowedExtensions.includes(fileExt)) {
						// the file extension is not allowed
						validation = false;
						res.send(setRes(resCode.BadRequest, false, 'You can upload only jpg, jpeg, png, gif files', null))
					}
				}

			}

			
			if (validation) {
				await businessModel.findOne({
					where: {
						id: data.business_id,
						is_deleted: false,
						is_active: true
					}
				}).then(async business => {
					if (_.isEmpty(business)) {
						return res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
					} else {
						await productModel.create(data).then(async function (product) {
							const lastInsertId = product.id;
							if (lastInsertId) {
								var files = [];
								for (const file of filesData) {

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
									if (result) {
										files.push(`products/${lastInsertId}/${fileName}`)
										fs.unlinkSync(file.path)

									}
								}
								var image = files.join(';');
								productModel.update({
									image: image
								}, {
									where: {
										id: lastInsertId,

									}
								}).then(productData => {
									if (productData) {
										productModel.findOne({ where: { id: lastInsertId } }).then(async getData => {
											var product_images = getData.image
											var image_array = [];
											for (const data of product_images) {
												const signurl = await awsConfig.getSignUrl(data).then(function (res) {

													image_array.push(res);
												});
											}
											getData.dataValues.product_images = image_array

											res.send(setRes(resCode.OK, true, "Product added successfully", getData))
										})
									} else {
										res.send(setRes(resCode.BadRequest, false, "Image not update", getData))
									}
								})
							}

						}).catch(error => {
							res.send(setRes(resCode.BadRequest, false, "Fail to add product or service.", null))
						})
					}
				})
			}
		} else {
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
		}
	}catch(error){
		console.log(error)
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}

}
exports.UpdateProductDetail = async (req, res) => {

	var data = req.body
	
	var productModel = models.products

	var options = {
		where:{
			is_deleted:false,
		}
	}

	const row = await productModel.findByPk(data.id,options);
	if(row == null){
		return res.send(setRes(resCode.ResourceNotFound, false, 'Product not found', null));
	}
	const image = !_.isEmpty(row.image) && row.image != null ? row.image : 0;
	
	if (data.id){
		if(data.name){
			var name = data.name;
			var validname = /^[A-Z+_a-z+_0-9 ]+$/;
			if (name.match(validname) == null) {
				return res.send(setRes(resCode.BadRequest, false, 'Please enter valid product name.', null));
			}
		}
		if(data.name && !_.isEmpty(data.name)){
			var condition = {};
			condition.where = {is_deleted:false,
				name: {
					[models.Op.eq]: data.name
				},
				id:{
					[models.Op.ne]: data.id
				}
			}
			if(data.category_id){
				condition.where = {...condition.where,...{category_id:data.category_id}}
			}
			if(data.sub_category_id){
				condition.where = {...condition.where,...{sub_category_id:data.sub_category_id}}
			}
			const existCategory = await productModel.findOne(condition);
			if(existCategory){
				validation = false;
				return res.send(setRes(resCode.BadRequest, false, 'This product name is already exists with this category!',null))
			}
		}

		if(data.price && !_.isEmpty(data.price)){
			if(data.price <= 0 ){
				validation = false;
					return res.send(setRes(resCode.BadRequest, false, "Please enter price value more than 0.", null))
			}
		}
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
		
		await productModel.update(data,{
			where: {
				id: data.id,
				is_deleted: false
			}
		}).then(async UpdatedProduct => {
			if (UpdatedProduct == 1){

				await productModel.findOne({
					where: {
						id: data.id,
						is_deleted: false
					}
				}).then(async UpdatedProduct => {
					if (UpdatedProduct != null){
						var product_images = UpdatedProduct.image
						var image_array = [];
						if(product_images != null){

							for(const data of product_images){
								const signurl = await awsConfig.getSignUrl(data).then(function(res){

			  						image_array.push(res);
								});
							}
						}else{
							image_array.push(commonConfig.default_image)
						}
						UpdatedProduct.dataValues.product_images = image_array
						res.send(setRes(resCode.OK, true, "Product updated successfully.",UpdatedProduct))
					}
				}).catch(error => {
					res.send(setRes(resCode.BadRequest, false, "Fail to updated product or service.",null))
				}).catch(UpdateProductError => {
					res.send(setRes(resCode.BadRequest, false, "Fail to updated product or service.",null))
				})
			}
		}).catch(UpdateProductError => {
			res.send(setRes(resCode.BadRequest, false, "Fail to updated product or service.",null))
		})
	}
	else{
		res.send(setRes(resCode.BadRequest, false, 'id is required',null))
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

	var data = req.params
	var productModel = models.products
	var productRattingModel = models.product_ratings
	var categoryModel = models.product_categorys
	var shoppingCartModel = models.shopping_cart
	var wishlistModel = models.wishlists

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
		if (product && product.id != null){
			
			var isFav = false;
			var isAddCart = false;

			await shoppingCartModel.findOne({
				where: {
					product_id: product.id,
					business_id:product.business_id,
					is_deleted: false
				},}).then(async cart => {
					if(cart){
						isAddCart = true;
					}
				})

				await wishlistModel.findOne({
					where: {
						product_id: product.id,
						is_deleted: false
					},}).then(async fav => {
						if(fav){
							isFav = true;
						}
					})

			var product_images = product.image
			var image_array = [];
			if(product_images != null){

				for(const data of product_images){
					const signurl = await awsConfig.getSignUrl(data).then(function(res){
						image_array.push(res);
					});
				}
			}else{
				image_array.push(commonConfig.default_image)
			}
			
			product.dataValues.product_images = image_array
			if(product.product_categorys != null){
				product.dataValues.category_name = product.product_categorys.name

				delete product.dataValues.product_categorys
			}else{
				product.dataValues.category_name = ""
			}
			if(product.sub_category != null){

				product.dataValues.product_type = product.sub_category.name
				delete product.dataValues.sub_category
			}else{
				product.dataValues.product_type = "";
			}

				product.dataValues.is_fav = isFav;
				product.dataValues.is_added_cart = isAddCart;

			res.send(setRes(resCode.OK, true, "Get product detail successfully.",product))
			
		}
		else{
			res.send(setRes(resCode.ResourceNotFound,false, "Product not found.",null))
			// res.send(setRes(resCode.ResourceNotFound, null, true, "Resource not found."))

		}
	}).catch(GetProductError => {
		res.send(setRes(resCode.InternalServer,false, "Internal server error.",null))
		
	})

}

exports.RemoveProductImage = async(req, res) => {

	var data = req.body
	var productModel = models.products

	var requiredFields = _.reject(['id','image_name'], (o) => { return _.has(data, o) })
	if(requiredFields == ""){

		if (data.image_name) {

			await productModel.findOne({
				where: {
					id: data.id,
					is_deleted: false
				}
			}).then(async productData => {
				if(productData){
				var replaceImages = await _.filter(productData.image, (img) => {
					var typeArr = data.image_name;
					 if(!typeArr.includes(img)){
						return img;
					 }
					 return ''
				})
				var new_images = replaceImages.join(';')
				var productremoveimages = data.image_name;
					for(const data of productremoveimages){
						const params = {
							Bucket: awsConfig.Bucket,
							Key: data
						};
						awsConfig.deleteImageAWS(params)
					}
			
			
					await productModel.update({
						image: new_images
					},{
						where : {
							id: data.id
						}
					}).then(async updatedProduct => {
						
						if (updatedProduct > 0) {
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
								res.send(setRes(resCode.OK, true, "Image remove successfully",product))
							})
						}

					}).catch(error => {
						res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
					})
				}else{
				res.send(setRes(resCode.ResourceNotFound, false, "Product not found.",null))
					
				}				
			}).catch(error => {
				res.send(setRes(resCode.BadRequest, false, "Fail to remove image from product.",null))
			})

		} else {
			res.send(setRes(resCode.BadRequest, false, "Invalid image name...",null))
		}
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}
exports.CreateCategory = async (req, res) => {
 
	var data = req.body
	req.file ? data.image = `${req.file.key}`: '';
	var productCategoryModel = models.product_categorys
	var businessModel = models.business
	var validation = true;

	var requiredFields = _.reject(['business_id','name','image','parent_id'], (o) => { return _.has(data, o)  })

		if(requiredFields == ""){
		var name = data.name;
		var validname = /^[A-Z+_a-z+_0-9 ]+$/;
		if (name.match(validname) == null) {
			if(data.parent_id == 0){
				return res.send(setRes(resCode.BadRequest, false, 'Please enter valid product category name.', null));
			}else{
				return res.send(setRes(resCode.BadRequest, false, 'Please enter valid product type name.', null));
			}
		}

		businessModel.findOne({
			where:{
				id:data.business_id,
				is_deleted:false,
				is_active:true
			}
		}).then(async business => {
			if(_.isEmpty(business)){
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.",null))
			}else{
				if((data.parent_id != 0 && !_.isEmpty(data.parent_id))){
					const parentCategory = await productCategoryModel.findOne({
						where:{
							id:data.parent_id,is_deleted:false,
						}
					});
					if(!parentCategory){
						validation = false;
						return res.send(setRes(resCode.BadRequest, false, 'Product parent category not found!',null))
					}
				}

				if(data.parent_id == 0 && !_.isEmpty(data.parent_id)){
					const existCategory = await productCategoryModel.findOne({
						where:{is_deleted:false,business_id:data.business_id,parent_id:{
							[models.Op.eq]:0
						},
						name: {
							[models.Op.eq]: data.name}
						}
					});
					if(existCategory){
						validation = false;
						return res.send(setRes(resCode.BadRequest, false, 'This product category name is already exists with this business!',null))
					}
				}
				
				if(data.parent_id != 0 && !_.isEmpty(data.parent_id)){
					const existSubCategory = await productCategoryModel.findOne({
						where:{is_deleted:false,parent_id:data.parent_id,business_id:data.business_id,parent_id:{
							[models.Op.ne]:0
						},
						name: {
							[models.Op.eq]: data.name}
						}
					});
					if(existSubCategory){
						validation = false;
						return res.send(setRes(resCode.BadRequest, false, 'This product type name is already exists with this category!',null))
					}
				}

				if(validation){
					await productCategoryModel.create(data).then(async categoryData => {

						if(categoryData){
							if(data.image != null){
			
								var image = await awsConfig.getSignUrl(data.image).then(function(res){
									data.image = res
								})
							}else{
								data.image = commonConfig.default_image
							}
							if(categoryData.parent_id == 0){
								return res.send(setRes(resCode.OK,true,"Product category added successfully",data))
							}else{
								return res.send(setRes(resCode.OK,true,"Product type added successfully",data))
							}
						}else{
							res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
						}
					})
				}
			}})
		
	}else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}

}

exports.CategoryList = async(req, res) => {

	
	var data = req.body

	var productCategoryModel = models.product_categorys

	var requiredFields = _.reject(['business_id','page','page_size'], (o) => { return _.has(data, o)  })
	if(requiredFields == ""){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
		var condition = {where:{
			business_id:data.business_id,
			is_deleted: false,
			is_enable: true,
			parent_id:0
		},
		order: [
			['name', 'ASC']
		]}
		if(data.page_size != 0 && !_.isEmpty(data.page_size)){
			condition.offset = skip,
			condition.limit = limit
		}

		var condition2 = {where:{
			business_id:data.business_id,
			is_deleted: false,
			is_enable: true,
			parent_id:0
		},
		order: [
			['createdAt', 'DESC']
		]}

		var totalRecords = null

		productCategoryModel.findAll(condition2).then(async(CartList) => {
			totalRecords = CartList.length
		})
		productCategoryModel.findAll(condition).then(async categoryData => {
			if (categoryData){
				// Update Sign URL
				for(const data of categoryData){

					if(data.image != null){
					  	const signurl = await awsConfig.getSignUrl(data.image).then(function(res){
					  		data.image = res;		  
					  	});
					  }else{
					  	data.image = commonConfig.default_image;
					  }
				}

				const previous_page = (data.page - 1);
				const last_page = Math.ceil(totalRecords / data.page_size);
				var next_page = null;
				if(last_page > data.page){
					var pageNumber = data.page;
					pageNumber++;
					next_page = pageNumber;
				}
				
				var response = {};
				response.totalPages = (data.page_size != 0) ? Math.ceil(totalRecords/limit) : 1;
				response.currentPage = parseInt(data.page);
				response.per_page =  (data.page_size != 0) ? parseInt(data.page_size) : totalRecords;
				response.total_records = totalRecords;
				response.data = categoryData;
				response.previousPage = (previous_page == 0) ? null : previous_page ;
				response.nextPage = next_page;
				response.lastPage = last_page;

				res.send(setRes(resCode.OK, true, "Get category detail successfully.",response))
			}
				
		}).catch(error => {
			res.send(setRes(resCode.BadRequest, false, "Fail to send request.",null))
		})	
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
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
			if(categoryData.image != null){

				var categoryData_image = await awsConfig.getSignUrl(categoryData.image).then(function(res){
					categoryData.image = res;
				})
			}else{
				categoryData.image = commonConfig.default_image;
			}
			res.send(setRes(resCode.OK, true, "Get category detail successfully.",categoryData))
		}
		else{
			res.send(setRes(resCode.ResourceNotFound,false, "Category not found.",null))
		}
	}).catch(GetCategoryError => {
		res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
	})
}

exports.UpdateCategory = async(req, res) => {

	var data = req.body
	req.file ? data.image = `${req.file.key}`: '';
	var productCategoryModel = models.product_categorys
	var requiredFields = _.reject(['id','business_id'], (o) => { return _.has(data, o)  })
	if(requiredFields == ""){
		if(! _.isEmpty){
			var name = data.name;
			var validname = /^[A-Z+_a-z+_0-9 ]+$/;
			if (name.match(validname) == null) {
				if(data.parent_id == 0){
					return res.send(setRes(resCode.BadRequest, false, 'Please enter valid product category name.', null));
				}else{
					return res.send(setRes(resCode.BadRequest, false, 'Please enter valid product type name.', null));
				}
			}
		}
		if((data.parent_id != 0 && !_.isEmpty(data.parent_id))){
			const parentCategory = await productCategoryModel.findOne({
				where:{
					id:{
						[models.Op.eq]:data.parent_id,
						[models.Op.ne]:data.id,
					},is_deleted:false,
				}
			});
			if(!parentCategory){
				validation = false;
				return res.send(setRes(resCode.BadRequest, false, 'Product parent category not found!',null))
			}
		}

		if(data.parent_id == 0 && !_.isEmpty(data.parent_id)){
			const existCategory = await productCategoryModel.findOne({
				where:{
					is_deleted:false,
					business_id:data.business_id,
					parent_id:{
						[models.Op.eq]:0
					},
					id:{
						[models.Op.ne]:data.id
					},
					name: {
						[models.Op.eq]: data.name,
					}
				}
			});
			if(existCategory){
				validation = false;
				return res.send(setRes(resCode.BadRequest, false, 'This product category name is already exists with this business!',null))
			}
		}
		
		if(data.parent_id != 0 && !_.isEmpty(data.parent_id)){
			const existSubCategory = await productCategoryModel.findOne({
				where:{
					is_deleted:false,
					business_id:data.business_id,
					parent_id:{
						[models.Op.ne]:0
					},
					parent_id:data.parent_id,
					id:{
						[models.Op.ne]:data.id
					},
					name: {
						[models.Op.eq]: data.name,
					}
				}
			});
			if(existSubCategory){
				validation = false;
				return res.send(setRes(resCode.BadRequest, false, 'This product type name is already exists with this category!',null))
			}
		}

		await productCategoryModel.findOne({
			where:{
				id:data.id,is_deleted:false,is_enable:true
			}
		}).then(async categoryData => {
			if(categoryData != null){

				if(data.image){
		
					const params = {
								    Bucket: awsConfig.Bucket,
								    Key: categoryData.image
								};
					awsConfig.deleteImageAWS(params)
				}
				await productCategoryModel.update(data,{
					where: {
						id: data.id,
						is_deleted: false,
						is_enable: true
					}
				}).then(async updateData => {
					if(updateData == 1){
						await productCategoryModel.findOne({
							where:{id: data.id,
							is_deleted: false,
							is_enable: true
						}}).then(async categoryDetail => {

							if(categoryDetail.image != null){

								var categoryDetail_image = await awsConfig.getSignUrl(categoryDetail.image).then(function(res){
									categoryDetail.image = res;
								})
							}else{
								categoryDetail.image = awsConfig.default_image;
							}
							if(categoryDetail.parent_id == 0){
								return res.send(setRes(resCode.OK,true,"Product category updated successfully",data))
							}else{
								return res.send(setRes(resCode.OK,true,"Product type updated successfully",data))
							}
						})
					}else{
						res.send(setRes(resCode.BadRequest, false, "Fail to update category or service.",null))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,"Category not found",null))
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.RemoveCategory = async(req, res) => {

	var data = req.params
	var productModel = models.products
	var productCategoryModel = models.product_categorys
	var cartModel = models.shopping_cart
	var orderDetailsModel = models.order_details
	var wishlistModel = models.wishlists
	var Op = models.Op;

	if(data.id){

		productModel.findAll({
			where:{
				[Op.or]:{
					category_id:data.id,
					sub_category_id:data.id
				},
				is_deleted:false,
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
					res.send(setRes(resCode.BadRequest,false,"You can not delete this category because some product of this sub-category are into some user carts",null))
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
							res.send(setRes(resCode.BadRequest,false,"You can not delete this category because some product of this sub-category are into some user wishlist",null))
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
									res.send(setRes(resCode.BadRequest,false,"You can not delete this category because some ongoing order of this sub-category product",null))
								}else{
									productCategoryModel.findAll({
										where:{
											parent_id:data.id,
											is_deleted:false,
											is_enable:true,
										}
									}).then(async subCategoryData => {
										if(subCategoryData.length > 0){
											return res.send(setRes(resCode.BadRequest,false,"You can not delete this category because some sub category are active.",null))
										}else{
											productCategoryModel.findOne({
												where:{
													id:data.id,
													is_deleted:false,
													is_enable:true,
													parent_id: {
														[Op.eq]:0
													}
												}
											}).then(categoryData => {
												if(categoryData != null){
													categoryData.update({is_deleted:true,is_enable:false})
													res.send(setRes(resCode.OK,true,"Product category deleted successfully",null))
												}else{
													res.send(setRes(resCode.ResourceNotFound,false,"Product category not found",null))
												}
											})
										}
									})
									
								}
							})
						}
					})
				}
			})			
		}).catch(error => {
			res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
		})
	}else{
		res.send(setRes.BadRequest,false,"id is required.",null)
	}

}

exports.ProductTypeList = async(req, res) => {

	var data = req.body;
	var categoryModel = models.product_categorys
	var Op = models.Op;

	var requiredFields = _.reject(['page','page_size','business_id'], (o) => { return _.has(data, o) })
	if(requiredFields == ""){

		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)

		var condition = {
			subQuery:false,
			order: [
				['name', 'ASC']
			],
			include:{
				model: categoryModel,
          		attributes: ['id', 'name'],
			}
		};
		condition.where = {business_id:data.business_id,parent_id:{
				[Op.ne]: 0	
			},is_deleted:false}
			condition.attributes =  { exclude: ['is_deleted', 'is_enable','createdAt','updatedAt'] }

		if(data.category_id) {
			condition.where = {business_id:data.business_id,parent_id:data.category_id,is_deleted:false}
		}
		if(data.search && data.search != null){
			condition.where = {[Op.or]: [{name: {[Op.like]: "%" + data.search + "%",}}],}
		}
		if(data.page_size != 0 && !_.isEmpty(data.page_size)){
			condition.offset = skip,
			condition.limit = limit
		}

		var condition2 = {
			subQuery:false,
			order: [
				['createdAt', 'DESC']
			],
			
		};
		condition2.where = {business_id:data.business_id,parent_id:{
				[Op.ne]: 0	
			},is_deleted:false}
			condition2.attributes =  { exclude: ['is_deleted', 'is_enable','createdAt','updatedAt'] }

		if(data.category_id) {
			condition2.where = {business_id:data.business_id,parent_id:data.category_id,is_deleted:false}
		}
		if(data.search && data.search != null){
			condition2.where = {[Op.or]: [{name: {[Op.like]: "%" + data.search + "%",}}],}
		}

		var totalRecords = null

		categoryModel.findAll(condition2).then(async(CartList) => {
			totalRecords = CartList.length
		})

		categoryModel.findAll(condition).then(async subCategoryData => {
			if (subCategoryData != '' && subCategoryData != null ){
			// Update Sign URL
			for(const data of subCategoryData){
				if(data.image != null){

				  	const signurl = await awsConfig.getSignUrl(data.image).then(function(res){
				  		data.image = res;		  
				  	});
				  }else{

				  	data.image = commonConfig.default_image;
				  }

				  if(data.product_category != null){
					data.dataValues.category_name = data.product_category.name;
					delete data.dataValues.product_category;
				  }else{
					data.dataValues.category_name = null;
				  }

			}
				const previous_page = (data.page - 1);
				const last_page = Math.ceil(totalRecords / data.page_size);
				var next_page = null;
				if(last_page > data.page){
					var pageNumber = data.page;
					pageNumber++;
					next_page = pageNumber;
				}
				var response = {};
				response.totalPages = Math.ceil(subCategoryData.length/limit);
				response.currentPage = parseInt(data.page);
				response.per_page = parseInt(data.page_size);
				response.total_records = totalRecords;
				response.data = subCategoryData;
				response.previousPage = previous_page;
				response.nextPage = next_page;
				response.lastPage = last_page;
				res.send(setRes(resCode.OK, true, "Get product type  details successfully.",response))
			}else{
				res.send(setRes(resCode.ResourceNotFound, true, "Product type not found.",null))
			}
		}).catch(error => {
			console.log (error)
			res.send(setRes(resCode.InternalServer,false, "Internal server error.",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))		
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

		if(productData.length > 0){
			res.send(setRes(resCode.BadRequest,false,"You Can not delete this Product Type because it contains Existing Products!",null))
		}else{
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
						res.send(setRes(resCode.BadRequest,false,"You can not delete this category because some product of this sub-category are into some user carts",null))
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
								res.send(setRes(resCode.BadRequest,false,"You can not delete this category because some product of this sub-category are into some user wishlist",null))
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
										res.send(setRes(resCode.BadRequest,false,"You can not delete this category because some ongoing order of this sub-category product",null))
									}else{
										productCategoryModel.findOne({
											where:{
												id:data.id,
												is_deleted:false,
												is_enable:true,
												parent_id: {
													[Op.ne]:0,
												}
											}
										}).then(subCategoryData => {

											if(subCategoryData != null){

												subCategoryData.update({is_deleted:true,is_enable:false})
												res.send(setRes(resCode.OK,true,"Product type deleted successfully",null))
											}else{
												res.send(setRes(resCode.ResourceNotFound,false,"Product type not found",null))
											}
										})
									}
								})
							}
						})
					}
				})	
			}
	}).catch(error => {
		res.send(setRes(resCode.BadRequest, false, "Internal server error.",null))
	})
}

exports.AddProductRattings = async(req,res) => {

	var data = req.body
	var userModel = models.user
	var productModel = models.products
	var productRattingModel = models.product_ratings
	var requiredFields = _.reject(['user_id','product_id','ratings','description'], (o) => { return _.has(data, o) })

	if(requiredFields == ""){
		userModel.findOne({
			where:{
				id:data.user_id,
				is_deleted:false,
				is_active:true
			}
		}).then(async user => {
			if(_.isEmpty(user)){
				res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
			}else{
				productModel.findOne({
					where:{
						id:data.product_id,
						is_deleted:false
					}
				}).then(async product => {
					if(_.isEmpty(product)){
						res.send(setRes(resCode.ResourceNotFound, false, "Product not found.",null))
					}else{
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
											res.send(setRes(resCode.OK,true,"Product ratting update successfully",rattingDetails))
										})
									}else{
										res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
									}
								})
							}else{
								productRattingModel.create(data).then(addRattingData => {
				
									res.send(setRes(resCode.OK,true,"Product ratting save successfully",addRattingData))
								})
							}
						}).catch(error => {
							res.send(setRes(resCode.BadRequest,false,"Fail to add product ratting",null))
						})
					}
				})
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.GetProductRattings = async(req,res)=>{

	var data = req.body
	var productRattingModel = models.product_ratings
	var userModel = models.user
	const businessModel = models.business;
	const userEmail = req.userEmail;
	const Op = models.Op
	var requiredFields = _.reject(['product_id','page','page_size'], (o) => { return _.has(data, o) })
	let userDetail, userRole;

	userDetail = await userModel.findOne({
		where: {
			email:  userEmail
		}
	});
	if (userDetail) {
		userRole = userDetail?.role_id
	} else {
		userDetail = await businessModel.findOne({
			where: {
				email:  userEmail
			}
		});
		if (userDetail) {
			userRole = userDetail?.role_id
		}
	}

	const reportedReviewCond = userRole && userRole === 2 ? {
		user_id : userDetail.id,
	} : {};

	const whereCond = {
		[Op.or] : [
			{
				product_id : data.product_id,
				is_deleted : false,
				is_review_report: true,
				...reportedReviewCond
			},
			{
				product_id : data.product_id,
				is_deleted : false,
				is_review_report: false,
				user_id : { [Op.not]: userDetail.id },
			}
		]
	}

	if(requiredFields == ""){

		const condition =  {
			where: whereCond,
			include:{
				model:userModel
			},
			order: [
				['createdAt', 'DESC']
			],
			attributes: { exclude: ['is_deleted', 'updatedAt'] }
		}

		const skip = data.page_size * (data.page - 1)
		const limit = parseInt(data.page_size)

		const recordCounts = await productRattingModel.findAndCountAll({...condition, offset: skip, limit});
		const totalRecords =  recordCounts?.count;
		productRattingModel.findAll({
			offset:skip,
			limit:limit,
			...condition
		}).then(async ratingData => {

			for(const data of ratingData){

				data.dataValues.user_name = data.user.username
				if(data.user.profile_picture != null){
					const signurl = await awsConfig.getSignUrl(data.user.profile_picture).then(function(res){
						data.dataValues.profile_picture = res
					})
				}else{
					data.dataValues.profile_picture = commonConfig.default_user_image;
				}
				data.dataValues.ratings = data.ratings
				data.dataValues.review = data.description

				delete data.dataValues.user
				delete data.dataValues.description
			}
			const previous_page = (data.page - 1);
			const last_page = Math.ceil(totalRecords / data.page_size);
			let next_page = null;
			if(last_page > data.page){
				var pageNumber = data.page;
				next_page = +(pageNumber) + 1;
			}

			const response = {};
			response.totalPages = Math.ceil(totalRecords/limit);
			response.currentPage = parseInt(data.page);
			response.per_page = parseInt(data.page_size);
			response.total_records = totalRecords;
			response.data = ratingData;
			response.previousPage = previous_page;
			response.nextPage = next_page;
			response.lastPage = last_page;

			res.send(setRes(resCode.OK,true,'Get ratings successfully',response))
		}).catch(error => {
			res.send(setRes(resCode.BadRequest, false,'Fail to get ratings',null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))	
	}
}

exports.reportCustomerReview = (req, res) => {
	const data = req.body
	const userEmail = req.userEmail;
	const businessModel = models.business;
	const productRattingModel = models.product_ratings
	const requiredFields = _.reject(['product_rating_id','description'], (o) => { return _.has(data, o) })
	if (requiredFields == "") {
		businessModel.findOne({ email : userEmail }).then(user => {
			if (user) {
					productRattingModel.findOne({ where: { id: data.product_rating_id, is_deleted: false }, attributes: {exclude: ['createdAt', 'updatedAt']} }).then(productRating => {
						if (productRating) {
							productRattingModel.update({is_review_report:true, report_description: data.description }, {
								where: {
									id: data.product_rating_id,
								}
							}).then(UpdateData =>{
								productRattingModel.findOne({ where: { id: data.product_rating_id, is_deleted: false }, attributes: {exclude: ['createdAt', 'updatedAt']} }).then(updatedproductRating => {
									res.send(setRes(resCode.OK, true, "Review reported successfully.",updatedproductRating))
								})
							}).catch(error => {
								res.send(setRes(resCode.InternalServer, false, "Fail to report Customer review.",null))
							})
						} else {
							res.send(setRes(resCode.InternalServer, false, "Product review not found.",null))
						}
					});
			} else {
				res.send(setRes(resCode.BadRequest, false, 'Business User not exists ',null));
			}
		});
	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null));
	}
}

//  Simillar product get 
exports.simillarProducts = async(req,res) => {
	var val = req.params;
	var productModel = models.products
	var productCategoryModel = models.product_categorys
	var Op = models.Op
	var requiredFields = _.reject(['id'], (o) => { return _.has(val, o)  })

	if (requiredFields == ''){
		productModel.findOne({
			where:{
				id:val.id,
				is_deleted:false
			}
		}).then(async product => {
			if((_.isEmpty(product) || product == null || product == 0)){
				return res.send(setRes(resCode.ResourceNotFound, true, "Product not found.",null))
			}else{
				var condition = {}
				condition.where = {
					is_deleted:false,
					id:{
						[Op.ne] : product.id
					},
					category_id:product.category_id
				}
				condition.attributes = ['id','name','price','description','category_id','image'] 
				productModel.findAll(condition).then(async categoryData => {
					if(categoryData.length > 0){
						const shuffledArrays = _.shuffle(categoryData);
						let responseData = shuffledArrays.slice(0, 5);
						for (const data of responseData) {
							var product_image = data.image
							var image_array = [];
							if (product_image != null) {
								for (const data of product_image) {
									const signurl = await awsConfig.getSignUrl(data).then(function (res) {
										image_array.push(res);
									});
								}
							}else{
								image_array.push(commonConfig.default_image)
							}
							if(product_image.length == 0) {
								image_array.push(commonConfig.default_image)
							}
							data.dataValues.product_image = _.first(image_array);
							delete data.dataValues.image;
						}
						return res.send(setRes(resCode.OK, true,'Get simillar products details.',responseData))
					}else{
						res.send(setRes(resCode.ResourceNotFound, true, "Get simillar products details not found.",[]))
					}
				})
			}
		}).catch(error => {
			res.send(setRes(resCode.BadRequest, false,'Fail to get simillar products.',null))
		})

	}else{
		
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.deleteProduct = async(req,res) => {
	var data = req.params
	var validation = true;
	var productModel = models.products
	var shoppingCartModel = models.shopping_cart
	var wishlistModel = models.wishlists
	var orderDetailsModel = models.order_details
	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })
	var Op = models.Op

	if (requiredFields == ''){
		productModel.findOne({
			where: {
				id: data.id,
				is_deleted: false
			}
			}).then(async product => {
				if (product != null) {
					
					const cartProduct= await shoppingCartModel.findAll({
						where: {
							product_id: product.id,
							is_deleted: false
						},
					})

					if(cartProduct.length > 0){
						validation = false;
						return res.send(setRes(resCode.BadRequest, false,'You can not delete this product because this product is in cart',null))
					}

					const orders = await orderDetailsModel.findAll({
						where: {
							product_id: product.id,
							is_deleted: false,
							order_status:{
								[Op.ne]:3,
							}
						},
					})

					if(orders.length > 0){
						validation = false;
						return res.send(setRes(resCode.BadRequest, false,'You can not delete this product because this product is in orders',null))
					}

					const wishlistProduct = await wishlistModel.findAll({
						where: {
							product_id: product.id,
							is_deleted: false
						},
					});

					if(wishlistProduct.length > 0){
						validation = false;
						return res.send(setRes(resCode.BadRequest, false,'You can not delete this product because this product is in wishlist',null))
					}

					await product.update({
						is_deleted: true,
					}).then(async deleteData => {
						if (deleteData) {
							var product_images = deleteData.image
							var image_array = [];
							if (product_images != null) {
								for (const data of product_images) {
									const params = {
										Bucket: awsConfig.Bucket,
										Key: data
									};
									awsConfig.deleteImageAWS(params)
								}
							}
							await productModel.findOne({
								where: {
									id: data.id,
								}
								}).then(async delProduct => {
									return res.send(setRes(resCode.OK, true, "Product deleted successfully", delProduct))
								})
						}

					});
				} else {
					return res.send(setRes(resCode.ResourceNotFound, false, 'Product not found.', null))
				}
			})
	}else{
		return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}