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
const Sequelize = require('sequelize');
var notification = require('../../push_notification')
var moment = require('moment')
const MomentRange = require('moment-range');
const Moment = MomentRange.extendMoment(moment);
var fs = require('fs');
var awsConfig = require('../../config/aws_S3_config');

exports.createInquiry = async (req, res) => {

  console.log(req.body)
  var data = req.body
  var dbModel = models.business_inquiry;
  var businessModel = models.business;
  var Op = models.Op

  var requiredFields = _.reject(['business_name', 'contact_person', 'email', 'phone', 'address', 'latitude', 'longitude', 'user_id', 'description'], (o) => { return _.has(data, o)  })

 	 if (requiredFields == ''){
		businessModel.findOne({where: {phone:data.phone}})

		businessModel.findOne({where: {phone: data.phone, is_deleted: false}}).then(business => {
			if (business == null){
				dbModel.findOne(
					{
						where: {
							is_deleted: false,
							[Op.or]: [
								{email: data.email},
								{phone: data.phone}
							]
						}
					}).then((inquiry) => {
					if (inquiry == null){
						dbModel.create(data).then(function (inquiry) {
							if (inquiry) {
								res.send(setRes(resCode.OK, true, 'Business inquiry submitted successfully',inquiry));
							} else {
								res.send(setRes(resCode.BadRequest, false, 'Fail to create inquiry',null));
							}
						});
					}
					else{
						if (inquiry.email == data.email){
							res.send(setRes(resCode.BadRequest, false, 'Inquiry already created on this email.',null));
						}
						else if (inquiry.phone == data.phone){
							res.send(setRes(resCode.BadRequest, false, 'Inquiry already created on this number.',null));
						}
						else{
							res.send(setRes(resCode.InternalServer, false, 'Internal server error.',null));
						}
					}
				}).catch(inquiryError => {
					res.send(setRes(resCode.BadRequest, false, inquiryError.message,null));
				})
			}
			else{
				res.send(setRes(resCode.BadRequest, false, 'This number already register with business.',null));
			}
		})
	
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
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
	if (data.type == 1 || data.type == 2){
		whereCategory.id = data.type
	}
	

	var requiredFields = _.reject(['page', 'page_size', 'latitude', 'longitude', 'type'], (o) => { return _.has(data, o)  })

 	 if (requiredFields == ''){

		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
	  }
	  var skip = data.page_size * (data.page - 1)
	  var limit = parseInt(data.page_size)

	  //get distance by latitude longitude in km
	  const query = '( 6371 * acos( cos( radians('+data.latitude+') ) * cos( radians( latitude ) ) * cos( radians( longitude ) - radians('+data.longitude+') ) + sin( radians('+data.latitude+') ) * sin( radians( latitude ) ) ) )'

		business.findAll({
			attributes: { include : [
				[Sequelize.literal(query),'distance'],
				[Sequelize.fn('AVG', Sequelize.col('ratings.rating')),'rating']
			]},
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
				{
					model: template
				}
			],
			having: {
				distance: {
					[Op.lt]: 10000
				}
			},
			group: ['business.id'],
			order: Sequelize.col('distance'),
			offset:skip,
			limit : parseInt(limit),
			subQuery:false

		}).then((business) => {

			_.map(business, async(Obj) => {
				var banner = await awsConfig.getSignUrl(Obj.banner).then(function(res){
					Obj.banner = res
				});
  			var template_url = await awsConfig.getSignUrl(Obj.template.image).then(function(res){
  				Obj.template.template_url = res
  			});
  			return Obj;
				// return Obj.template.template_url = Obj.template.template_url.concat(`?bid=${Obj.id}&uid=${data.user_id}&ccd=${Obj.color_code}`)
			})

			// business.banner = awsConfig.getSignUrl(business.banner)
			res.send(setRes(resCode.OK, true, "Available businesses near you.",business))
		})
		.catch((err) => {
			res.send(setRes(resCode.BadRequest, false, "Internal server error",null))
		})

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),true))
	}
}


exports.GetBusinessDetail = async (req, res) => {

	var data = req.body
	var businessModel = models.business
	var category = models.business_categorys;
	var rating = models.ratings;
	var template = models.templates;
	var Op = models.Op

	var requiredFields = _.reject(['business_id'], (o) => { return _.has(data, o)  })
	if (requiredFields == ''){

		businessModel.findOne({
			where: {
				id: data.business_id,
				is_deleted: false,
				is_active: 1
			},
			attributes: { include : [
				[Sequelize.fn('AVG', Sequelize.col('ratings.rating')),'rating']
			]},
			include: [
				{
					model: rating,
					attributes: []
				},
				{
					model: category,
				},
				{
					model: template
				}
			],
		}).then(async business => {
			if (business != '' && business != null && business.id != null){
				var business_banner = await awsConfig.getSignUrl(business.banner).then(function(res){
					business.banner = res;
				})
				var business_template_template_url = await awsConfig.getSignUrl(business.template.image).then(function(res){
					business.template.template_url = res
				})
				var business_template_image = await awsConfig.getSignUrl(business.template.image).then(function(res){
					business.template.image = res
				})
				res.send(setRes(resCode.OK, true, "Get business detail successfully.",business))
			}else{
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.",null))
			}
			
		}).catch(error => {
			res.send(setRes(resCode.BadRequest, false, "Fail to send request.",null))
		})

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}

}
exports.GetProfile = async (req, res) =>{

	var data = req.params
	var businessModel = models.business
	var categoryModel = models.business_categorys
	
	businessModel.findOne({
		where:{
			id: data.id,
			is_deleted:false
		},
		include: [categoryModel]
	}).then(async business => {
		if (business != null){
			var business_banner = await awsConfig.getSignUrl(business.banner).then(function(res){
				business.banner = res
			});
			res.send(setRes(resCode.OK, true, "Get business profile successfully.",business))
		}
		else{
			res.send(setRes(resCode.ResourceNotFound, false, "Business not Found.",null))
		}
	}).catch(userError => {
		res.send(setRes(resCode.InternalServer, false, "Fail to Get business Profile.",null))
	})

}
exports.UpdateBusinessDetail = async (req, res) => {

	var data = req.body
	req.file ? data.banner = `${req.file.key}` : '';
	var businessModel = models.business
	var categoryModel = models.business_categorys
	if(data.banner){
		
		businessModel.findOne({where:{id:data.id,is_deleted:false,is_active:true}}).then(businessData =>{
			const params = {
						    Bucket: awsConfig.Bucket,
						    Key: businessData.banner
						};
			awsConfig.deleteImageAWS(params)
		})
	}

	businessModel.update(data, {
		where: {
			id: data.id,
			is_active: true,
			is_deleted: false
		}
	}).then(business => {
		if (business == 1){

			businessModel.findOne({
				where: {
					id: data.id,
					is_active: true,
					is_deleted: false
				},
				include: [categoryModel]
			}).then(async UpdatedBusiness => {
				if (UpdatedBusiness != null){
					var UpdatedBusiness_banner = await awsConfig.getSignUrl(UpdatedBusiness.banner).then(function(res){
						UpdatedBusiness.banner = res
					})
					res.send(setRes(resCode.OK, true, "Business detail update successfully.",UpdatedBusiness))
				}
				else{
					res.send(setRes(resCode.BadRequest, true, "Fail to update business detail.",null))		
				}
			})
		}else{
			res.send(setRes(resCode.BadRequest, false, "Fail to update business detail.",null))
		}
	}).catch(error => {
		res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
	})
}

exports.ChangePassword = async(req, res) => {

	var data = req.body
	var businessModel = models.business

	var requiredFields = _.reject(['id','old_password','new_password','confirm_password'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		businessModel.findOne({
			where:{
				id:data.id,
				is_deleted:false,
				is_active :true
			}
		}).then(business => {
			if (business != null){
				bcrypt.compare(data.old_password, business.password, function(error, isValid){
					if (!error && isValid == true){
						bcrypt.hash(data.new_password, 10).then(hash => {
							businessModel.update({
								password:hash
							},{
								where:{
									id: data.id
								}
							}).then(updated => {
								if (updated == 1){
									res.send(setRes(resCode.OK, true, 'Password updated successfully.',null))
								}
								else{
									res.send(setRes(resCode.InternalServer, false, "Fail to update password.",null))
								}
							})
						})
					}
					else{
						res.send(setRes(resCode.BadRequest, false, "Old password not match.",null))
					}
				})
			}
			else{
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.",null))
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.GetImages = async (req, res) => {
	var data = req.body
	var gallery = models.gallery;

	var requiredFields = _.reject(['business_id'], (o) => { return _.has(data, o)  })
	if (requiredFields == ''){
		gallery.findAll({
			where: {
				business_id: data.business_id,
				is_deleted: false
			}
		}).then(async gallery => {
			if (gallery != null && gallery != ''){
				for(const data of gallery){
				  const signurl = await awsConfig.getSignUrl(`${data.image}`).then(function(res){

				  	data.image = res;		  
				  });
				}
				res.send(setRes(resCode.OK, true, "Available images for your business.",gallery))
			}
			else{
				res.send(setRes(resCode.ResourceNotFound, false, "No images found for your business.",null))
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.UploadCompanyImages = async (req, res) => {
	var data = req.body
	var files = req.files
	var galleryModel = models.gallery;

	var requiredFields = _.reject(['business_id'], (o) => { return _.has(data, o)  })
	if (requiredFields == ''){



		if(files.length > 0){
			var recordArray = []
			async.forEach(files, (singleFile, cbSingleFile) => {

				var row = {
					business_id: data.business_id,
					image:  `${singleFile.key}`
				}
				recordArray.push(row)
				cbSingleFile()

			}, () => {
				if (recordArray.length > 0){
					galleryModel.bulkCreate(recordArray).then(async gallery => {
						for(const data of gallery){
						  const signurl = await awsConfig.getSignUrl(`${data.image}`).then(function(res){

						  	data.image = res;		  
						  });
						}
						res.send(setRes(resCode.OK, true, 'images are uploded successfully.',gallery))
					}).catch(error => {
						res.send(setRes(resCode.BadRequest, false, "Fail to upload images.",null))
					})
				}
			})
		}
		else{
			res.send(setRes(resCode.BadRequest, false, "Please upload one or more file."),null)
		}

	}else{
		console.log("in");
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.GetAllOffers = async (req, res) => {
	var offerModel = models.offers;
	var data = req.body
	var businessModel = models.business
	var categoryModel = models.business_categorys

	var requiredFields = _.reject(['page','page_size'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1"),null)
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
		
		var condition = {
			offset:skip,
			limit : limit,
			subQuery:false,
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
		data.business_id ? condition.where = {business_id:data.business_id, is_deleted: false} : condition.where = {is_deleted: false},

		offerModel.findAll(condition).then(async(offers) => {
			if (offers.length > 0){
				for(offer of offers){
					var offer_image = await awsConfig.getSignUrl(offer.image).then(function(res){
						offer.image = res
					})
					var offer_business_banner = await awsConfig.getSignUrl(offer.business.banner).then(function(res){
						offer.business.banner = res
					})
				}
				res.send(setRes(resCode.OK, true, "Get offers list successfully",offers))
			}else{
				res.send(setRes(resCode.ResourceNotFound, false, "Offer not found",null))
			}
		})
		.catch((error) => {
			res.send(setRes(resCode.BadRequest, false, "Fail to get offers list",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.UpdateOfferDetail = async (req, res) => {

	var data = req.body
	req.file ? data.image = `${req.file.key}`: '';
	var offerModel = models.offers
	var productInqModel = models.product_inquiry;
	var userModel = models.user;

	if (data.id){
		if(data.image){
			offerModel.findOne({where:{id:data.id,is_deleted:false}}).then(offerData => {
				const params = {
							    Bucket: awsConfig.Bucket,
							    Key: offerData.image
							};
				awsConfig.deleteImageAWS(params)
			});
		}
		offerModel.update(data,{
			where: {
				id: data.id,
				is_deleted: false
			}
		}).then(UpdatedOffer => {
			if (UpdatedOffer == 1){

				offerModel.findOne({
					where: {
						id: data.id,
						is_deleted: false
					}
				}).then(async UpdatedOffer => {
					if (UpdatedOffer != null){
						var UpdatedOffer_image = await awsConfig.getSignUrl(UpdatedOffer.image).then(function(res){
							UpdatedOffer.image = res
						})
						res.send(setRes(resCode.OK, true, "Offer updated successfully.",UpdatedOffer))
					}
					else{
						res.send(setRes(resCode.BadRequest, false, "Fail to get offer.",null))		
					}
				})
			}
			else{
				res.send(setRes(resCode.BadRequest, false, "Fail to update offer.",null))
			}
		}).catch(UpdateOfferError => {
			res.send(setRes(resCode.BadRequest, false, "Fail to updated offer.",null))
		})
	}
	else{
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
				
				product_inquiries = JSON.parse(JSON.stringify(product_inquiries))
				// console.log(product_inquiries)
				async.forEach(product_inquiries, function (singleInquery, cbSingleInquery){
					// console.log('=======================')
					// console.log(singleInquery)

					userModel.findOne({
						where: {
							id: singleInquery.user_id,
							is_deleted: 0
						}
					}).then(user => {
						if (user != null && user.device_token != null){
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
			 var offer_image = await awsConfig.getSignUrl(offer.image).then(function(res){
			 		offer.image = res
			 })
			res.send(setRes(resCode.OK, true, "Offer added successfully.",offer))
		}).catch(error => {
			res.send(setRes(resCode.BadRequest, false, "Fail to add offer.",null))
		})
	}
}

exports.CreateOffer = async (req, res) => {

	var data = req.body
	req.file ? data.image = `${req.file.key}`: '';
	var offerModel = models.offers
	
	console.log(data);

	var requiredFields = _.reject(['business_id', 'name', 'description', 'repeat_every', 'end_date', 'start_date'], (o) => { return _.has(data, o)  })

	data.repeat_every == 1 ? (data.repeat_on ? '' : requiredFields.push('repeat_on')) : '';

	_.contains([1,2], parseInt(data.repeat_every)) ? data.repeat = true : '';

	var repeat_on_validation = _.reject(data.repeat_on, (v) => {
		return _.has([0,1,2,3,4,5,6], parseInt(v))
	})

	if (repeat_on_validation == '') {
		
		if (requiredFields == ''){

			var Offer = await createOffer(data)

			if (Offer != ''){
				Offer.image = await awsConfig.getSignUrl(Offer.image).then(function(res){
					Offer.image = res
				})
				res.send(setRes(resCode.OK, true, 'Offer created successfully.',Offer))
			}
			else{
				res.send(setRes(resCode.BadRequest, true, "Fail to create offer.",null))
			}

		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),true))
		}

	} else {
		res.send(setRes(resCode.BadRequest, false, "repeat_on value must between 0-6...",null))
	}
}

function createOffer(data){
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

exports.UpdateOffer = (req, res) => {

	var data = req.body
	req.file ? data.image = `${req.file.key}`: '';
	var offerModel = models.offers
	
	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })

	data.repeat_every == 1 ? (data.repeat_on ? '' : requiredFields.push('repeat_on')) : '';

	_.contains([1,2], parseInt(data.repeat_every)) ? data.repeat = true : '';

 	if (requiredFields == ''){

		offerModel.findOne({
			where: {
				id: data.id,
				is_deleted: false
			}
		}).then(OfferData => {

			if (OfferData) {

				if(data.image){
		
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
					if (updatedOffer > 0){
						
						offerModel.findOne({
							where: {
								id: data.id,
								is_deleted: false
							}
						}).then(async offer => {
							var offer_image = await awsConfig.getSignUrl(offer.image).then(function(res){
								offer.image = res
							})
							res.send(setRes(resCode.OK, true, "Offer updated successfully.",offer))
						}).catch(error => {
							console.log('===========update offer========')
							console.log(error.message)
							res.send(setRes(resCode.InternalServer, false, "Fail to update offer.",null))
						})

					}
				})

			} else {
				res.send(setRes(resCode.ResourceNotFound, false, "Resource not found !!",null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer, false, "Internal server error",null))
		})
		

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.GetOffers = (req, res) => {

	var resObj = {}
	var data = req.body
	var offerModel = models.offers;
	var businessModel = models.business
	var categoryModel = models.business_categorys
	var Op = models.Op

	var requiredFields = _.reject(['business_id'], (o) => { return _.has(data, o)  })

 	if (requiredFields == ''){

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
							day = o.repeat_on.map(function(v) {
									return parseInt(v);
								});


							var now = start;

							while (now.isBefore(end) || now.isSame(end)) {
								if (v === moment(now).format('DD-MM-YYYY') && day.includes(moment(now,'YYYY-MM-DD').day())) {
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
				if (data.limit && data.limit > 0){
					function firstN(obj, n) {
						return _.chain(obj)
						  .keys()
						  .sort()
						  .take(n)
						  .reduce(function(memo, current) {
							arrRes.push(obj[current]);
							return memo;
						  }, {})
						  .value();
					  }
					  
					firstN(resObj, data.limit)
				}
				//////////////////////////////////
				const offer = Object.keys(resObj)

				for(const offers of offer){

					var resObj_offers_dataValues_image_url = await awsConfig.getSignUrl(resObj[offers].dataValues.image).then(function(res){
						resObj[offers].dataValues.image_url = res
					})
					
				}
				
				res.send(setRes(resCode.OK , true, "Available Offers.",(data.limit ? arrRes : resObj)))
			})
			.catch(error => {
				console.log('============get offer error==========')
				console.log(error.message)
				res.send(setRes(resCode.InternalServer, false, "Internal server error",null))
			})

		}).catch(error => {
			console.log(error.message + ' ...business.controller');
			res.send(setRes(resCode.InternalServer, false, 'Internal server error.',null))
		})

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}

}

exports.ManageBannerAndBooking = function (req, res) {

	var data = req.body
	req.file ? data.banner = `${req.file.key}` : '';
	var businessModel = models.business;
  
	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })
  
	  if (requiredFields == ''){
		  businessModel.update(data,{
			  where: {
				  id: data.id
			  }
		  }).then(updateBanner => {
			  if (updateBanner == 1){
				  res.send(setRes(resCode.OK, true, "Banner updated successfully.",null))
			  }
			  else{
				  res.send(setRes(resCode.BadRequest, false, "Fail to update banner.",null))
			  }
		  }).catch(UpdateBannerError => {
			  res.send(setRes(resCode.BadRequest, false, "Fail to updated banner.",null))
		  })
	  }
	  else{
		  res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	  }
}
 
exports.GetCategory = async (req, res) => {

	var categoryModel = models.business_categorys;
	categoryModel.findAll({
		where: {
				is_deleted: false
			},
		order: [
				['createdAt', 'DESC']
			],
			
	}).then(categories => {
		if (categories != '' && categories != null ){
		
			res.send(setRes(resCode.OK, true, "Get business category successfully..",categories))
		}else{
			res.send(setRes(resCode.ResourceNotFound, true, "Business category not found.",null))
		}
			
	}).catch(error => {
		res.send(setRes(resCode.BadRequest, false, "Fail to send request.",null))
	})
}
exports.CreateBusiness = async (req, res) => {
	var data = req.body
	req.file ? data.banner = `${req.file.key}`: '';
	// return false
	var businessModel = models.business
	var inquiryModel = models.business_inquiry
	var Op = models.Op
	var requiredFields = _.reject(['business_name','username','phone','category_id','email','password','abn_no','address','description','account_name','account_number','latitude','longitude'], (o) => { return _.has(data, o)  })
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
	if (requiredFields == ''){
		// businessModel.findOne({where: {email: data.email, is_deleted: false}}).then((business) => {
		// 	if (business == null){
				await businessModel.findOne({
					where: {
						is_deleted: false,
						[Op.or]: [
							{email: data.email},
							{phone: data.phone}
						]
					}
				}).then(async (validation) => {
					if(validation == null){
					 	await businessModel.create(data).then(async business => {

							if (data.id){
		
								await inquiryModel.update({
									is_deleted: true
								},{
									where: {
										id: data.id
									}
								}).then(inquiry => {
									if (inquiry > 0){
										res.send(setRes(resCode.OK, true, "Business created successfully.",business))
									}
									else{
										res.send(setRes(resCode.InternalServer, false, "Fail to remove Inquity.",null))
									}
								})
		
							}
							else{
								if(business.banner != null){
									var business_banner = await awsConfig.getSignUrl(business.banner).then(function(res){
										business.banner = res
									});
								}
								res.send(setRes(resCode.OK, true, "Business created successfully.",business))
							}
						})
					}
					else if((data.phone.length > 12) || (data.phone.length < 7)){
						res.send(setRes(resCode.BadRequest, false, 'Please enter valid mobile number.',null));
					}else if(validation.phone == data.phone){
							res.send(setRes(resCode.BadRequest, false, 'Mobile number already exist.',null));
					}
					else if (validation.email == data.email){
						console.log('email')
						res.send(setRes(resCode.BadRequest, false, 'Business already exist on this email.',null));
					}
					else{
						console.log('server')
						res.send(setRes(resCode.InternalServer, false, 'Internal server error.',null));
					}
				}).catch(error => {
					res.send(setRes(resCode.BadRequest, false, error.message,null));
				})
			// }else{
			// 	res.send(setRes(resCode.BadRequest, false, 'Business already exist',null));
			// }
		// })
		// .catch(error => {
		// 	console.log(error.message)
		// 	res.send(setRes(resCode.InternalServer, false, "Fail to create Business.",null))
		// })	
	}
	else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
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

	var requiredFields = _.reject(['inquiry'], (o) => { return _.has(data, o)  })

		if (requiredFields == ''){

			ProductInqModel.findOne({
				where: {
					id: data.inquiry,
					is_deleted: false
				},
				include: [ { all: true, nested: true } ]
			}).then(proInquery => {

				if (proInquery != null){

					var businessRef = db.ref(`businesses/${proInquery.business_id}/customer_ids`)
					var customerRef = db.ref(`customers/${proInquery.user_id}/business_ids`)
					var MessageChatRef = db.ref(`messages/business_${proInquery.business_id}_customer_${proInquery.user_id}/chat/${moment().unix()}_customer`)
					var MessageDetailRef = db.ref(`messages/business_${proInquery.business_id}_customer_${proInquery.user_id}/details`)

					businessRef.once('value', (fireBusinessData) => {
						fireBusinessData = JSON.parse(JSON.stringify(fireBusinessData))

						if (fireBusinessData != null){
							console.log(fireBusinessData)
							var nextKey = parseInt(_.last(_.keys(fireBusinessData)))+1

							//add user id in business array
							_.contains(fireBusinessData, proInquery.user_id) ? '' : businessRef.child(nextKey).set(proInquery.user_id)
							
							customerRef.once('value', async (fireCustomerData) => {
								fireCustomerData = JSON.parse(JSON.stringify(fireCustomerData))

								if (fireCustomerData != null){
									var nextKey = parseInt(_.last(_.keys(fireCustomerData)))+1

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

									InquiryDetailRes != null ? res.send(setRes(resCode.OK, InquiryDetailRes , false, "Chat Initialize Successfully..")) : res.send(setRes(resCode.InternalServer, null, true, "Fail to initialize chat."))
								}
								else{
									var setBusiness_ids = db.ref(`customers/${proInquery.user_id}`)
		
									//create new customer & add business id (for first time only)
									setBusiness_ids.child('business_ids').set({0: proInquery.business_id})
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

									InquiryDetailRes != null ? res.send(setRes(resCode.OK, InquiryDetailRes , false, "Chat Initialize Successfully..")) : res.send(setRes(resCode.InternalServer, null, true, "Fail to initialize chat."))
								}

							})
						}
						else{
							console.log(fireBusinessData)

							var setCustomer_ids = db.ref(`businesses/${proInquery.business_id}`)

							//create new business & add user id (for first time only)
							setCustomer_ids.child('customer_ids').set({0: proInquery.user_id})
							setCustomer_ids.child('name').set(proInquery.business.business_name)

							customerRef.once('value', async (fireCustomerData) => {
								fireCustomerData = JSON.parse(JSON.stringify(fireCustomerData))

								if (fireCustomerData != null){
									var nextKey = parseInt(_.last(_.keys(fireCustomerData)))+1

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

									InquiryDetailRes != null ? res.send(setRes(resCode.OK, InquiryDetailRes , false, "Chat Initialize Successfully..")) : res.send(setRes(resCode.InternalServer, null, true, "Fail to initialize chat."))
								}
								else{
									var setBusiness_ids = db.ref(`customers/${proInquery.user_id}`)
		
									//create new customer & add business id (for first time only)
									setBusiness_ids.child('business_ids').set({0: proInquery.business_id})
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

									InquiryDetailRes != null ? res.send(setRes(resCode.OK, InquiryDetailRes , false, "Chat Initialize Successfully..")) : res.send(setRes(resCode.InternalServer, null, true, "Fail to initialize chat."))
								}

							})

						}

					})

				}
				else{
					res.send(setRes(resCode.BadRequest, false, "Inquiry not found.",null))
				}

			}).catch(getProductInqError => {
				res.send(setRes(resCode.InternalServer, false, getProductInqError.message,null))
			})

		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}
}


function UpdateProInquiry(inquiryId){
	var ProductInqModel = models.product_inquiry
	
	return new Promise((resolve, reject) => {
		ProductInqModel.update({
			chat_init: 1
		},{
			where: {
				id: inquiryId,
				is_deleted: 0
			}
		}).then(inquiry => {
			if (inquiry == 1){
				ProductInqModel.findOne({
					where: {
						id: inquiryId,
						is_deleted: 0
					}
				}).then(UpdatedInquiry => {
					if (UpdatedInquiry != ''){
						resolve(UpdatedInquiry)
						// res.send(setRes(resCode.OK, UpdatedInquiry , false, "Chat Initialize Successfully.."))
					}
					else{
						resolve(null)
						// res.send(setRes(resCode.InternalServer, null, true, "Fail to get inquiry."))		
					}
				}).catch(GetInquiryError => {
					resolve(null)
					// res.send(setRes(resCode.BadRequest, null, true, GetInquiryError))
				})
				
			}else{
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

	var requiredFields = _.reject(['user_id', 'business_id', 'date', 'time'], (o) => { return _.has(data, o)  })

 	if (requiredFields == ''){

		userModel.findOne({
			where: {
				id: data.user_id,
				is_deleted: false,
				is_active: true
			}
		}).then((users) => {
			if (users != null){

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
							if (business != null && business.device_token != null){
								
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

						res.send(setRes(resCode.OK, true, 'Booking created successfully.',booking));
					} else {
						res.send(setRes(resCode.BadRequest, false, 'Fail to create Booking.',null));
					}
				});
			}
			else{
				res.send(setRes(resCode.BadRequest, false, 'Fail to create Booking.',null));
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}

}