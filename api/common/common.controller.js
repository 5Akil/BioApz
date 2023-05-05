var setRes = require('../../response');
var resCode = require('../../config/res_code_config');
var _ = require('underscore');
var async = require('async');
var models = require('../../models')
var bcrypt = require('bcrypt')
var models = require('../../models')
const Sequelize = require('sequelize');
var fs = require('fs')
var awsConfig = require('../../config/aws_S3_config');

exports.ProductTableSearch = function (req, res) {

    var data = req.body;
    var productModel = models.products;
    var Op = models.Op;
    var requiredFields = _.reject(['page','page_size'], (o) => { return _.has(data, o)  })
    if(requiredFields == ""){

	    if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}
	    var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
	    var condition = {
	    	offset:skip,
			limit : limit,
		};
		condition.where = {
	            name: {
			      [Op.like]: `%${data.str}%`
			    },
			    is_deleted: false,
			    
	        }
	    productModel.findAll(condition).then(async products => {
	        // products = JSON.parse(JSON.stringify(products))
	        for(const data of products){
			  	var product_images = data.image
				var image_array = [];
			
					for(const data of product_images){
						const signurl = await awsConfig.getSignUrl(data).then(function(res){

	  						image_array.push(res);
						});
					}
				data.dataValues.product_images = image_array	  
			}
	        res.send(setRes(resCode.OK, true, "Product search completed..",products))
	    }).catch(error => {
	        res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
	    })
    }else{
    	res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
    }

}

exports.RecommendedBusinessSearch = (req, res) => {

	var data = req.body;
	var business = models.business;
	var template = models.templates;
	var category = models.business_categorys;
	var rating = models.ratings;
	var Op = models.Op
	//0 - recomended, 1 - restaurent, 2 - cloth
	var whereCategory = {}
	if (data.type == 1 || data.type == 2){
		whereCategory.id = data.type
	}

	var requiredFields = _.reject(['latitude', 'longitude', 'type'], (o) => { return _.has(data, o)  })

 	 if (requiredFields == ''){

	  const query = '( 6371 * acos( cos( radians('+data.latitude+') ) * cos( radians( latitude ) ) * cos( radians( longitude ) - radians('+data.longitude+') ) + sin( radians('+data.latitude+') ) * sin( radians( latitude ) ) ) )'

		business.findAll({
			// where: Sequelize.where(Sequelize.fn('lower', Sequelize.col('name')), {[Op.like]: `%${data.str}%`}),
			// where: Sequelize.where(Sequelize.col('business_name'), {[Op.like]: `%${data.str}%`}),
			attributes: { include : [
				[Sequelize.literal(query),'distance'],
				[Sequelize.fn('AVG', Sequelize.col('ratings.rating')),'rating']
			]},
			include: [
				{
					model: rating,
					attributes: []
				},
				{
					model: category,
					where: whereCategory,
				},
				{
					model: template
				}
			],
			having: {
				distance: {
					[Op.lt]: 25000
				}
			},
			group: ['business.id'],
			order: Sequelize.col('distance'),
			subQuery:false

		}).then((business) => {

			_.map(business, (Obj) => {
				// return Obj.template.template_url = Obj.template.template_url.concat(`?bid=${Obj.id}&ccd=${Obj.color_code}`)
			})
            business = JSON.parse(JSON.stringify(business))
            //filter start

            var filterData = _.filter(business, function (obj) {
                return _.values(obj).some(function (el) {
                    return el != null ? el.toString().toLowerCase().indexOf(data.str.toLowerCase()) > -1 : '';
                });
            });

            //filter over

			res.send(setRes(resCode.OK, true, "Business search completed..",filterData))
		})
		.catch((err) => {
			res.send(setRes(resCode.InternalServer, false, "Internal server error",null))
		})

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}

}


exports.ChatNotification = (req, res) => {
	var Queue = require('better-queue');

	var db = admin.database()

	var userModel = models.user;
	var businessModel = models.business;

	var NotificationData = {};

	var NotificationRef = db.ref(`notifications`)

	var NotificationQueue = new Queue(function (task, cb) {
		if (task.role == 'customer'){
			userModel.findOne({
				where: {
					id: task.id,
					is_deleted: false
				}
			}).then(user => {
				if (user != null){
					NotificationData.device_token = user.device_token
					NotificationData.message = task.text
					notification.SendNotification(NotificationData)
				}
			})
		}else{
			businessModel.findOne({
				where: {
					id: task.id,
					is_deleted: false
				}
			}).then(business => {
				if (business != null){
					NotificationData.device_token = business.device_token
					NotificationData.message = task.text
					notification.SendNotification(NotificationData)
				}
			})
		}
		cb();
	})

	var RemoveDataQueue = new Queue(function (task, cb) {
		NotificationRef.child(task).remove();
		cb();
	})

	NotificationRef.on("child_added", function(snapshot) {

		snapshotVal = JSON.parse(JSON.stringify(snapshot.val()))
		snapshotKey = JSON.parse(JSON.stringify(snapshot.key))
		NotificationQueue.push(snapshotVal);
		RemoveDataQueue.push(snapshotKey)

	})

	// NotificationRef.once("value", function(snapshot) {

	// 	async.forEach(snapshot.val(), (singleSnap, cbSnap) => {
	// 		if (singleSnap.role == 'customer'){
	// 			userModel.findOne({
	// 				where: {
	// 					id: singleSnap.id,
	// 					is_deleted: false
	// 				}
	// 			}).then(user => {
	// 				if (user != null){
	// 					NotificationData.device_token = user.device_token
	// 					NotificationData.message = singleSnap.text
	// 					notification.SendNotification(NotificationData)
	// 					cbSnap()
	// 				}
	// 			})
	// 		}else{
	// 			businessModel.findOne({
	// 				where: {
	// 					id: singleSnap.id,
	// 					is_deleted: false
	// 				}
	// 			}).then(business => {
	// 				if (business != null){
	// 					NotificationData.device_token = business.device_token
	// 					NotificationData.message = singleSnap.text
	// 					notification.SendNotification(NotificationData)
	// 					cbSnap()
	// 				}
	// 			})
	// 		}
	// 	}, () => {
	// 		snapshot.forEach((function(child) { NotificationRef.child(child.key).remove(); }))
	// 	})

	// })

}

exports.FilterProducts = (req, res) => {

	var productModel = models.products;
	var businessModel = models.business;
	var category = models.business_categorys;
	var data = req.body
	var { category, type, price } = req.query;

	var Op = models.Op
	var products = []
	var condition = {is_deleted:false};
	if (category) {
    	condition.category_id = parseInt(category);
  	}
  	if (type) {
    	condition.sub_category_id = type;
  	}

  	if(price) {
  		var price_range = price.split('_')
  		
  		condition.price =  {
      		[Op.between]: [price_range[0], price_range[1]]
    	};
  	}
	var requiredFields = _.reject(['page','page_size'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
		
		// data.category ? condition = {category_id:parseInt(data.category),is_deleted:false}:condition = {is_deleted:false};
		// data.type ? condition = {sub_category_id:data.type,is_deleted:false}:condition = {is_deleted:false};

		productModel.findAll({
			where:condition,
			offset:skip,
			limit:limit
		}).then(async productData => {
			if(productData.length > 0){

				for(const data of productData){
				  var product_images = data.image
						var image_array = [];
					
							for(const data of product_images){
								const signurl = await awsConfig.getSignUrl(data).then(function(res){

			  						image_array.push(res);
								});
							}
						data.dataValues.product_images = image_array	  
				}
				res.send(setRes(resCode.OK,true,'Product get successfully.',productData))
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,"Products are not found",null))
			}
		}) 
		// category.findOne({
		// 	where: {
		// 		[Op.and]:[
		// 			{ is_deleted: false },
		// 			Sequelize.where(Sequelize.fn('lower', Sequelize.col('name')), {[Op.like]: `%${data.filter}%`})
		// 		  ]
		// 	}
		// }).then(category => {
		// 	if (category != null){

		// 		businessModel.findAll({
		// 			where: {
		// 				is_deleted: false,
		// 				category_id: category.id,
		// 				is_active: true
		// 			}
		// 		}).then(businesses => {
		// 			if (businesses != null){

		// 				async.forEach(businesses, (singleBusiness, cbBusiness) => {

		// 					productModel.findAll({
		// 						where: {
		// 							business_id: singleBusiness.id,
		// 							is_deleted: false
		// 						},
		// 						offset:skip,
		// 						limit : limit,
		// 						subQuery:false,
		// 					}).then(BusinessProducts => {
		// 						if (BusinessProducts != null){
		// 							products = [...products, ...BusinessProducts]
		// 							cbBusiness()
		// 						}
		// 						else{
		// 							cbBusiness()
		// 						}
		// 					})

		// 				}, () => {
		// 					for(const data of products){
		// 		  				var product_images = data.image
		// 						var image_array = [];
							
		// 							for(const data of product_images){
		// 								const signurl = awsConfig.getSignUrl(data);
		// 			  					image_array.push(signurl);
		// 							}
		// 						data.dataValues.product_images = image_array	  
		// 					}
		// 					res.send(setRes(resCode.OK, products, false, "Available products get successfully"))

		// 				})

		// 			}
		// 			else{
		// 				res.send(setRes(resCode.ResourceNotFound, null, true, "Resource not found."))		
		// 			}
		// 		})

		// 	}
		// 	else{
		// 		res.send(setRes(resCode.ResourceNotFound, null, true, "Resource not found."))
		// 	}
		.catch(error => {
			res.send(setRes(resCode.InternalServer, false, "Internal server error",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}

}

//searching product with category [cloth shop, restaurant]
exports.Searching = (req, res) => {

	var data = req.body;
    var productModel = models.products;
	var Op = models.Op;
	var businessModel = models.business;
	var category = models.business_categorys;
	var products = []
	
	var requiredFields = _.reject(['str', 'filter', 'page','page_size'], (o) => { return _.has(data, o)  })

 	 if (requiredFields == ''){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size);
		var whereProduct = data.str != '' && data.str != null && data.str ? data.str : ''

		if (data.filter != '' && data.filter != null && data.filter){

			category.findOne({
				where: {
					[Op.and]:[
						{ is_deleted: false },
						Sequelize.where(Sequelize.fn('lower', Sequelize.col('name')), {[Op.like]: `%${data.filter}%`})
					  ]
				}
			}).then(category => {
				if (category != null){
	
					businessModel.findAll({
						where: {
							is_deleted: false,
							category_id: category.id,
							is_active: true
						}
					}).then(businesses => {
						if (businesses != null){
	
							async.forEach(businesses, (singleBusiness, cbBusiness) => {
								productModel.findAll({
									where: {
										[Op.and]:[
											Sequelize.where(Sequelize.fn('lower', Sequelize.col('name')), {[Op.like]: `${whereProduct}%`}),
											{
												business_id: singleBusiness.id,
												is_deleted: false
											}
										  ]
									},
									offset:skip,
									limit : limit,
									subQuery:false,
								}).then(BusinessProducts => {
									if (BusinessProducts != null){
										products = [...products, ...BusinessProducts]
										cbBusiness()
									}
									else{
										cbBusiness()
									}
								})
							}, async () => {
								for(const data of products){
								  var product_images = data.image
										var image_array = [];
									
											for(const data of product_images){
												const signurl = await awsConfig.getSignUrl(data).then(function(res){

							  						image_array.push(res);
												});
											}
										data.dataValues.product_images = image_array	  
								}
								res.send(setRes(resCode.OK, true, "search completed..",products))
							})

						}
						else{
							res.send(setRes(resCode.ResourceNotFound, false, "Resource not found.",null))		
						}
					})
				}
				else{
					res.send(setRes(resCode.ResourceNotFound, false, "Resource not found.",null))
				}
			}).catch(error => {
				res.send(setRes(resCode.InternalServer, false, error.message,null))
			})
		}
		else{
			
			productModel.findAll({
				where: Sequelize.where(Sequelize.col("name"), {
					[Op.like]: `${whereProduct}%`
				}),
				offset:skip,
				limit : limit,
				subQuery:false,
			}).then(async products => {
				// products = JSON.parse(JSON.stringify(products))
				for(const data of products){
					var product_images = data.image
						var image_array = [];
						
							for(const data of product_images){
								const signurl = await awsConfig.getSignUrl(data).then(function(res){

				  					image_array.push(res);
								});
							}
						data.dataValues.product_images = image_array	  
					}
				res.send(setRes(resCode.OK, true, "Product search completed..",products))
			}).catch(error => {
				res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
			})

		}

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}

}


exports.DeleteProductOffers = (req, res) => {

	var data = req.body
	var productModel = models.products
	var offerModel = models.offers
	var galleryModel = models.gallery
	var comboModel = models.combo_calendar
	var promosModel = models.promos
	var Op = models.Op

	if (data != null || data != undefined){

		if (data.product_id){

			productModel.findOne({
				where: {
					id: data.product_id
				}
			}).then(product => {

				//delete offer image from local directory
				var product_images = product.image
				_.each(product_images, (o) => {
					const params = {
						    Bucket: awsConfig.Bucket,
						    Key: o
						};
					awsConfig.deleteImageAWS(params)
				});

				//delete record from database
				productModel.update({is_deleted:true},{
					where: {
						id: data.product_id
					}
				}).then(DeleteProduct => {
					if (DeleteProduct == 1){
						res.send(setRes(resCode.OK, true, "Product deleted successfully.",{product_id: data.product_id}))
					}
					else{
						res.send(setRes(resCode.BadRequest, false, "Fail to delete product.",null))
					}
				}).catch(DeleteProductError => {
					res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
				})
	
			})
			
		}
		else if (data.offer_id){

			offerModel.findOne({
				where: {
					id: data.offer_id
				}
			}).then(offer => {

				//delete offer image from local directory
				const params = {
						    Bucket: awsConfig.Bucket,
						    Key: offer.image
						};
				awsConfig.deleteImageAWS(params)

				//delete record from database
				offerModel.update({is_deleted:true},{
					where: {
						id: data.offer_id
					}
				}).then(DeleteOffer => {
					if (DeleteOffer == 1){
						res.send(setRes(resCode.OK, true, "Offer deleted successfully.",{offer_id: data.offer_id}))
					}
					else{
						res.send(setRes(resCode.BadRequest, false, "Fail to delete offer.",null))
					}
				}).catch(DeleteOfferError => {
					res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
				})

			}).catch(error => {
				res.send(setRes(resCode.ResourceNotFound,false,"Resource not found",null))
			})
			
		}
		else if (data.image_ids){
			var  image_ids = JSON.parse("[" + data.image_ids + "]");
			//delete file from local directory
			
			galleryModel.findAll({
				where: {
					id: {
						[Op.in]: image_ids
					}
				}
			}).then(DeletedImages => {
					
				_.each(DeletedImages, (o) => {
					const params = {
						    Bucket: awsConfig.Bucket,
						    Key: o.image
						};
					awsConfig.deleteImageAWS(params)
				});

				galleryModel.update({is_deleted:true},{
					where: {
						id: image_ids
					}
				}).then(DeleteImages => {
					
					if (DeleteImages > 0){
						res.send(setRes(resCode.OK, true, "Images deleted successfully.",{image_ids: data.image_ids}))
					}
					else{
						res.send(setRes(resCode.BadRequest, false, "Fail to delete images.",null))
					}
				})

			}).catch(error => {
				res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
			})

			//delete file from local directory code over
				
		}
		else if (data.combo_id) {

			comboModel.findOne({
				where: {
					id: data.combo_id
				}
			}).then(combo => {

				if (combo != null) {

					//delete combo image from local directory
					_.each(combo.images, (image) => {
						const params = {
						    Bucket: awsConfig.Bucket,
						    Key: image
						};
						awsConfig.deleteImageAWS(params)
					})

					//delete record from database
					comboModel.update({is_deleted:true},{
						where: {
							id: data.combo_id,
							is_deleted:false
						}
					}).then(DeleteCombo => {
						if (DeleteCombo == 1){
							res.send(setRes(resCode.OK, true, "Event deleted successfully.",null))
						}
						else{
							res.send(setRes(resCode.ResourceNotFound, false, "Event not found.",null))
						}
					}).catch(DeleteComboError => {
						res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
					})

				} else {
					res.send(setRes(resCode.BadRequest, false, "Invalid combo ID.",null))
				}
				
	
			})

		} else if (data.promo_id){
			promosModel.findOne({
				where: {
					id: data.promo_id
				}
			}).then(promo => {

				if (promo != null) {

					//delete promo image from local directory
					const params = {
						    Bucket: awsConfig.Bucket,
						    Key: promo.image
						};
					awsConfig.deleteImageAWS(params)

					//delete record from database
					promosModel.update({is_deleted:true},{
						where: {
							id: data.promo_id
						}
					}).then(DeletePromo => {
						if (DeletePromo == 1){
							res.send(setRes(resCode.OK, true, "Promo deleted successfully.",{promo_id: data.promo_id}))
						}
						else{
							res.send(setRes(resCode.BadRequest, false, "Fail to delete promo.",null))
						}
					}).catch(DeletePromoError => {
						res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
					})

				} else {
					res.send(setRes(resCode.BadRequest, false, "Invalid Promo Id.",null))
				}
				
	
			})
		}
		else{
			res.send(setRes(resCode.BadRequest, false, "product_id or offer_id or image_ids or combo_id are required.",null))
		}

	}
}

exports.BusinessSearch = async (req, res) => {

	var data = req.body;
    var businessModel = models.business;
    var businesscateogryModel = models.business_categorys
    var Op = models.Op;

    var requiredFields = _.reject(['page','page_size'], (o) => { return _.has(data, o)  })
    if(requiredFields == ""){

	    if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}
	    var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
	    var condition = {
	    	offset:skip,
			limit : limit,
			include: {
				model: businesscateogryModel,
				attributes: ['name'] 
			},
			attributes: { exclude: ['is_deleted', 'is_enable','auth_token','device_type',
				'role_id','sections','template_id','color_code','approve_by',
				'booking_facility','abn_no','address','password','account_name','person_name',
				'reset_pass_token','reset_pass_expire','device_token','business_category','account_number',
				'latitude','longitude','email','device_id','phone'] }
		};
		condition.where = {
	            business_name: {
			      [Op.like]: `%${data.str}%`
			    },
			    is_deleted: false,
			    
	        }
	    businessModel.findAll(condition).then(async business => {

	    	if(business.length > 0){
		        for(const data of business){
		        data.dataValues.category_name = data.business_category.name
				delete data.dataValues.business_category;
		        	if(data.banner != null){

					  	const signurl = await awsConfig.getSignUrl(data.banner).then(function(res){
					  		data.banner = res
					  	})
		        	}
				}

	    	}else{
	    		res.send(setRes(resCode.ResourceNotFound,false,"Business not found",null))
	    	}
	        res.send(setRes(resCode.OK, false, "Business search completed.",business))
	    }).catch(error => {
	        res.send(setRes(resCode.InternalServer, false, "Fail to get business",null))
	    })
    }else{
    	res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
    }

}
