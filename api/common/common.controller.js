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
			res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
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
	        res.send(setRes(resCode.OK, products, false, "Product search completed.."))
	    }).catch(error => {
	        res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
	    })
    }else{
    	res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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

			res.send(setRes(resCode.OK, filterData, false, "Business search completed.."))
		})
		.catch((err) => {
			res.send(setRes(resCode.InternalServer, null, true, err.message))
		})

	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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
			res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
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
				res.send(setRes(resCode.OK,productData,false,'Product get successfully...'))
			}else{
				res.send(setRes(resCode.ResourceNotFound,null,false,"Products are not found"))
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
			res.send(setRes(resCode.InternalServer, null, true, error.message))
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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
			res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
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
								res.send(setRes(resCode.OK, products, false, "search completed.."))
							})

						}
						else{
							res.send(setRes(resCode.ResourceNotFound, null, true, "Resource not found."))		
						}
					})
				}
				else{
					res.send(setRes(resCode.ResourceNotFound, null, true, "Resource not found."))
				}
			}).catch(error => {
				res.send(setRes(resCode.InternalServer, null, true, error.message))
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
				res.send(setRes(resCode.OK, products, false, "Product search completed.."))
			}).catch(error => {
				res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
			})

		}

	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
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
						res.send(setRes(resCode.OK, {product_id: data.product_id}, false, "Product deleted successfully."))
					}
					else{
						res.send(setRes(resCode.BadRequest, null, true, "Fail to delete product."))
					}
				}).catch(DeleteProductError => {
					res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
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
						res.send(setRes(resCode.OK, {offer_id: data.offer_id}, false, "Offer deleted successfully."))
					}
					else{
						res.send(setRes(resCode.BadRequest, null, true, "Fail to delete offer."))
					}
				}).catch(DeleteOfferError => {
					res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
				})

			}).catch(error => {
				res.send(setRes(resCode.ResourceNotFound,null,false,"Resource not found"))
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
						res.send(setRes(resCode.OK, {image_ids: data.image_ids}, false, "Images deleted successfully."))
					}
					else{
						res.send(setRes(resCode.BadRequest, null, true, "Fail to delete images."))
					}
				})

			}).catch(error => {
				res.send(setRes(resCode.InternalServer,null,true,"Internal server error"))
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
							id: data.combo_id
						}
					}).then(DeleteCombo => {
						if (DeleteCombo == 1){
							res.send(setRes(resCode.OK, {combo_id: data.combo_id}, false, "Combo deleted successfully."))
						}
						else{
							res.send(setRes(resCode.BadRequest, null, true, "Fail to delete combo."))
						}
					}).catch(DeleteComboError => {
						res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
					})

				} else {
					res.send(setRes(resCode.BadRequest, null, true, "Invalid combo ID."))
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
							res.send(setRes(resCode.OK, {promo_id: data.promo_id}, false, "Promo deleted successfully."))
						}
						else{
							res.send(setRes(resCode.BadRequest, null, true, "Fail to delete promo."))
						}
					}).catch(DeletePromoError => {
						res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
					})

				} else {
					res.send(setRes(resCode.BadRequest, null, true, "Invalid Promo Id."))
				}
				
	
			})
		}
		else{
			res.send(setRes(resCode.BadRequest, null, true, "product_id or offer_id or image_ids or combo_id are required."))
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
			res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
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
	    		res.send(setRes(resCode.ResourceNotFound,null,false,"Business not found"))
	    	}
	        res.send(setRes(resCode.OK, business, false, "Business search completed.."))
	    }).catch(error => {
	        res.send(setRes(resCode.InternalServer, null, true, "Fail to get business"))
	    })
    }else{
    	res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
    }

}
