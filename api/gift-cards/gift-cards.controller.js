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


// Create Reward Gift Card START
exports.giftCardCreate = async(req,res) => {
	try{
		var data = req.body
		var giftCardModel = models.gift_cards
		var businessModel = models.business
		req.file ? data.image = `${req.file.key}`: '';
		var validation = true;
		var Op = models.Op;
		let arrayFields = ['image','name','amount','expire_at','description','is_cashback'];
		const result =  data.is_cashback == 1 ? (arrayFields.push('cashback_percentage')) : '';

		var requiredFields = _.reject(arrayFields, (o) => { return _.has(data, o)  })

		if(requiredFields.length == 0){
			var currentDate = (moment().format('YYYY-MM-DD') == moment(data.expire_at).format('YYYY-MM-DD'))
			var pastDate = moment(data.expire_at,'YYYY-MM-DD').isBefore(moment());
			if(result != '' && !((data.cashback_percentage >= Math.min(1,100)) && (data.cashback_percentage <= Math.max(1,100)))){
				res.send(setRes(resCode.BadRequest,false, "Please selete valid cashback percentage!",null))
			}else if(currentDate || pastDate){
				res.send(setRes(resCode.BadRequest,false, "You can't selete past and current date.!",null))
			}else if(!(Number.isInteger(Number(data.amount)))){
				res.send(setRes(resCode.BadRequest,false, "Amount field invalid.!",null))
			}else {
				if(validation){
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
							await giftCardModel.findOne({
								where: {
									isDeleted: false,
									status:true,
									name: {
										[Op.eq]: data.name
									}
								}
							}).then(async giftCard => {
								if(giftCard){
									res.send(setRes(resCode.BadRequest,false, "Gift card name already taken.!",null))
								}else{
									giftCardModel.create(data).then(async giftCardData => {
										if(giftCardData){
											if(data.image != null){
												var image = await awsConfig.getSignUrl(giftCardData.image).then(function(res){
													giftCardData.image = res
												})
											}else{
												giftCardData.image = commonConfig.default_image
											}
											res.send(setRes(resCode.OK,true,"Gift card added successfully",giftCardData))
										}else{
											res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
										}
									})
								}
							})
						}
					})
					
					
				}			
			}
		}else{
			res.send(setRes(resCode.BadRequest,false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}
// Create Reward Gift Card END

// Delete Reward Gift Card START
exports.deleteGiftCard =async(req,res) => {
	try{
		var data = req.params
		var giftCardModel = models.gift_cards
		var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })

		if(requiredFields == ""){
			giftCardModel.findOne({
			where: {
				id: data.id,
				status:true,
				isDeleted: false
			}
			}).then(async giftCardData => {
				console.log(giftCardData)
				var timestamps = moment().format('YYYY-MM-DD HH:mm:ss')
				if (giftCardData) {
					const params = {
							Bucket: awsConfig.Bucket,
							Key: giftCardData.image
						};
					awsConfig.deleteImageAWS(params)

					await giftCardData.update({ 
						isDeleted: true,
						status:false
					}).then(async deleteData => {
						if(deleteData){
							await giftCardModel.findOne({
								where: {
									id: deleteData.id
								}
								}).then(async Data => {
									const params = {
										Bucket: awsConfig.Bucket,
										Key: Data.image
									};
									awsConfig.deleteImageAWS(params)
									Data.destroy();
								});
						}
					});
					res.send(setRes(resCode.OK, true, "Gift card deleted successfully", null))
				} else {
					res.send(setRes(resCode.ResourceNotFound, false, "Gift card not found", null))
				}
			}).catch(error => {
				res.send(setRes(resCode.BadRequest, false, error, null))
			})
		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}
// Delete Reward Gift Card END

// View Reward Gift Card START
exports.giftCardView =async(req,res) => {
	try{
		var data = req.params
		var giftCardModel = models.gift_cards

		giftCardModel.findOne({
			where:{
				id:data.id,
				status:true,
				isDeleted:false
			}
		}).then(async giftCardData => {
			if (giftCardData != null){
				if(giftCardData.image != null){
					var giftCardData_image = await awsConfig.getSignUrl(giftCardData.image).then(function(res){
						giftCardData.image = res;
					})
				}else{
					giftCardData.image = commonConfig.default_image;
				}
				res.send(setRes(resCode.OK, true, "Get gift card detail successfully.",giftCardData))
			}
			else{
				res.send(setRes(resCode.ResourceNotFound,false, "Gift card not found.",null))
			}
		}).catch(error2 => {
			res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
		})
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}
// View Reward Gift Card END

// Update Reward Gift Card START
exports.giftCardUpdate =async(req,res) => {
	try{
		var data = req.body;
		req.file ? data.image = `${req.file.key}`: '';
		var giftCardModel = models.gift_cards;
		var Op = models.Op;
		let arrayFields = ['id','image','name','amount','expire_at','description','is_cashback'];
		const result =  data.is_cashback == 1 ? (arrayFields.push('cashback_percentage')) : '';

		var requiredFields = _.reject( arrayFields, (o) => { return _.has(data, o)  })

		if(requiredFields.length == 0){
			var currentDate = (moment().format('YYYY-MM-DD') == moment(data.expire_at).format('YYYY-MM-DD'))
			var pastDate = moment(data.expire_at,'YYYY-MM-DD').isBefore(moment());
			if((result != '' && !(data.cashback_percentage >= Math.min(1,100)) && (data.cashback_percentage <= Math.max(1,100)))){
				res.send(setRes(resCode.BadRequest,false, "Please selete valid cashback percentage!",null))
			}else if(currentDate || pastDate){
				res.send(setRes(resCode.BadRequest,false, "You can't selete past and current date.!",null))
			}else{
				giftCardModel.findOne({
					where:{id: data.id,isDeleted: false,status: true}
				}).then(async giftCardDetail => {
					if(_.isEmpty(giftCardDetail)){
						res.send(setRes(resCode.ResourceNotFound, false, "Gift Card not found.",null))
					}else{
						giftCardModel.findOne({
							where:{isDeleted:false,status:true,name:{[Op.eq]: data.name},id:{[Op.ne]: data.id}}
						}).then(async giftCardData => {
							if(giftCardData == null){
								giftCardModel.update(data,
									{where: {id:data.id,isDeleted:false,status:true}
								}).then(async updateData => {
									if(giftCardDetail.image){
										const params = {Bucket: awsConfig.Bucket,Key: giftCardDetail.image};awsConfig.deleteImageAWS(params)}
										if(updateData == 1){
											if(data.image != null){
												var updateData_image = await awsConfig.getSignUrl(data.image).then(function(res){
													giftCardDetail.image = res;
												})
											}else{
												giftCardDetail.image = awsConfig.default_image;
											}
											res.send(setRes(resCode.OK,true,'Gift card update successfully',giftCardDetail))
										}else{
											res.send(setRes(resCode.BadRequest, false, "Fail to update gift card.",null))
										}
									})
							}else{
								res.send(setRes(resCode.BadRequest,false, "Gift card name already taken.!",null))
							}
						})
					}
				})
			}
		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}
// Update Reward Gift Card END

// List Reward Gift Card START
exports.giftCardListOld =async(req,res) => {
	try{
		var data = req.body
		var giftCardModel = models.gift_cards
		const promises = [];

		var requiredFields = _.reject(['business_id','page','page_size'], (o) => { return _.has(data, o)  })

		if(requiredFields == ""){
			if(data.page < 0 || data.page == 0) {
				res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
			}
			var skip = data.page_size * (data.page - 1)
			var limit = parseInt(data.page_size)

			var condition = {
				offset:skip,
				limit : limit,
				order: [
					['createdAt', 'DESC']
				],
			}
			condition.where = {business_id:data.business_id,isDeleted:false,status:true}

			promises.push();

			giftCardModel.findAll(condition).then(async giftCardData => {
				if (giftCardData.length > 0){
					// Update Sign URL
					for(const data of giftCardData){
						if(data.image != null){
							var images = data.image
						  	const signurl = await awsConfig.getSignUrl(images.toString()).then(function(res){
						  		data.image = res;
						  	});
						}else {
						  	data.image = commonConfig.default_image;
						}
					}
					res.send(setRes(resCode.OK, true, "Get gift card detail successfully.",giftCardData))
				}else{
					res.send(setRes(resCode.ResourceNotFound, false, "Gift Card not found.",null))
				}		
			}).catch(error => {
				res.send(setRes(resCode.BadRequest, error, "Fail to send request.",null))
			})
		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}
// List Reward Gift Card END

exports.giftCardList =async(req,res) => {
	try{
		var data = req.body
		var giftCardModel = models.gift_cards
		var cashbackModel = models.cashbacks
		var discountModel = models.discounts
		var couponeModel = models.coupones
		const promises = [];

		var requiredFields = _.reject(['business_id','page','page_size'], (o) => { return _.has(data, o)  })

		if(requiredFields == ""){
			if(data.page < 0 || data.page == 0) {
				res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
			}
			var skip = data.page_size * (data.page - 1)
			var limit = parseInt(data.page_size)

			var condition = {
				offset:skip,
				limit : limit,
				order: [
					['createdAt', 'DESC']
				],
			}
			condition.where = {isDeleted:false,status:true}

			promises.push(
				giftCardModel.findAll(condition).then(async giftCardData => {
					if (giftCardData.length > 0){
						// Update Sign URL
						for(const data of giftCardData){
							if(data.image != null){
								var images = data.image
								const signurl = await awsConfig.getSignUrl(images.toString()).then(function(res){
									data.image = res;
								});
							}else {
								data.image = commonConfig.default_image;
							}
						}
						return giftCardData;
					}
					return [];
				}),
				cashbackModel.findAll(condition).then(async CashbackData => {
					if (CashbackData.length > 0){
						return CashbackData;
					}
					return [];		
				}),
				discountModel.findAll(condition).then(async DiscountData => {
					if (DiscountData.length > 0){
						return DiscountData;
					}
					return [];
				}),
				couponeModel.findAll(condition).then(async CouponeData => {
					if (CouponeData.length > 0){
						return CouponeData;
					}
					return [];
				})
			);

			const [giftcardRewards,cashbackData,discountData,couponeData] = await Promise.all(promises);

			const arrays = [giftcardRewards, cashbackData,discountData,couponeData];
			const mergedArray = mergeRandomArrayObjects(arrays);

			res.send(setRes(resCode.OK, true, "Get gift card detail successfully.",mergedArray))
			

		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		console.log(error)
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

function mergeRandomArrayObjects(arrays) {
  const shuffledArrays = _.shuffle(arrays);
  const mergedArray = [];

  _.each(shuffledArrays, function(array) {
    _.each(array, function(obj) {
      _.extend(obj, { random: Math.random() });
      mergedArray.push(obj);
    });
  });

  return mergedArray;
}