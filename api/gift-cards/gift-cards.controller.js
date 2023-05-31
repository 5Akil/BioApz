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
		let arrayFields = ['business_id','image','name','amount','expire_at','description','is_cashback'];
		const result =  data.is_cashback == 1 ? (arrayFields.push('cashback_percentage')) : '';

		var requiredFields = _.reject(arrayFields, (o) => { return _.has(data, o)  })

		if(requiredFields.length == 0){
			var currentDate = (moment().format('YYYY-MM-DD') == moment(data.expire_at).format('YYYY-MM-DD'))
			var pastDate = moment(data.expire_at,'YYYY-MM-DD').isBefore(moment());
			if(result != '' && !((data.cashback_percentage >= Math.min(1,100)) && (data.cashback_percentage <= Math.max(1,100)))){
				res.send(setRes(resCode.BadRequest,false, "Please select valid cashback percentage!",null))
			}else if(currentDate || pastDate){
				res.send(setRes(resCode.BadRequest,false, "You can't select past and current date.!",null))
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

// Update Reward Gift Card START
exports.giftCardUpdate = async (req, res) => {
	try {
		var data = req.body;
		req.file ? data.image = `${req.file.key}` : '';
		var giftCardModel = models.gift_cards;
		var Op = models.Op;
		let arrayFields = ['id', 'name', 'amount', 'expire_at', 'description', 'is_cashback'];
		const result = data.is_cashback == 1 ? (arrayFields.push('cashback_percentage')) : '';

		var requiredFields = _.reject(arrayFields, (o) => { return _.has(data, o) })

		if (requiredFields.length == 0) {
			var currentDate = (moment().format('YYYY-MM-DD') == moment(data.expire_at).format('YYYY-MM-DD'))
			var pastDate = moment(data.expire_at, 'YYYY-MM-DD').isBefore(moment());
			if ((result != '' && !(data.cashback_percentage >= Math.min(1, 100)) && (data.cashback_percentage <= Math.max(1, 100)))) {
				res.send(setRes(resCode.BadRequest, false, "Please select valid cashback percentage!", null))
			} else if (currentDate || pastDate) {
				res.send(setRes(resCode.BadRequest, false, "You can't select past and current date.!", null))
			} else {
				giftCardModel.findOne({
					where: { id: data.id, isDeleted: false, status: true }
				}).then(async giftCardDetail => {
					if (_.isEmpty(giftCardDetail)) {
						res.send(setRes(resCode.ResourceNotFound, false, "Gift Card not found.", null))
					} else {
						giftCardModel.findOne({
							where: { isDeleted: false, status: true, name: { [Op.eq]: data.name }, id: { [Op.ne]: data.id } }
						}).then(async giftCardData => {
							if (giftCardData == null) {
								giftCardModel.update(data,
									{
										where: { id: data.id, isDeleted: false, status: true }
									}).then(async updateData => {
										if (data.image != null) {
											const params = { Bucket: awsConfig.Bucket, Key: giftCardDetail.image }; awsConfig.deleteImageAWS(params)
										}
										if (updateData == 1) {
											if (data.image != null) {
												var updateData_image = await awsConfig.getSignUrl(data.image).then(function (res) {
													giftCardDetail.image = res;
												})
											} else if (giftCardDetail.image != null) {
												var updateData_image = await awsConfig.getSignUrl(giftCardDetail.image).then(function (res) {
													giftCardDetail.image = res;
												})
											}
											else {
												giftCardDetail.image = awsConfig.default_image;
											}
											res.send(setRes(resCode.OK, true, 'Gift card update successfully', giftCardDetail))
										} else {
											res.send(setRes(resCode.BadRequest, false, "Fail to update gift card.", null))
										}
									})
							} else {
								res.send(setRes(resCode.BadRequest, false, "Gift card name already taken.!", null))
							}
						})
					}
				})
			}
		} else {
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
		}
	} catch (error) {
		res.send(setRes(resCode.BadRequest, false, "Something went wrong!", null))
	}
}
// Update Reward Gift Card END

// List Rewards START
exports.commonRewardsList =async(req,res) => {
	try{
		var data = req.body
		var giftCardModel = models.gift_cards
		var cashbackModel = models.cashbacks
		var discountModel = models.discounts
		var couponeModel = models.coupones
		var loyaltyPointModel = models.loyalty_points
		var Op = models.Op
		var currentDate = (moment().format('YYYY-MM-DD'))
		const promises = [];
		var request_type = data.type

		var requiredFields = _.reject(['business_id','page','page_size','type'], (o) => { return _.has(data, o)  })

		if(requiredFields == ""){
			if(data.page < 0 || data.page == 0) {
				return res.send(setRes(resCode.BadRequest, null, false, "invalid page number, should start with 1"))
			}
			var typeArr = ['gift_cards','cashbacks','discounts','coupones','loyalty_points'];

			if((request_type) && !(typeArr.includes(request_type))){
				return res.send(setRes(resCode.BadRequest, null, false, "Please select valid type."))
			}
			// var skip = data.page_size * (data.page - 1)
			// var limit = parseInt(data.page_size)
			let skip = data.page_size * (data.page - 1);
			let limit = parseInt(data.page_size);

			promises.push(
				giftCardModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,[Op.or]: [{name: {[Op.like]: "%" + data.search + "%",}}],
					expire_at: { 
						[Op.gt]: currentDate
					},}
				}).then(async giftCardData => {
					if (giftCardData.length > 0){
						const dataArray = [];
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
							let result = 	JSON.parse(JSON.stringify(data));
							result.type="gift_cards";
							dataArray.push(result);
						}
						return dataArray;
					}
					return [];
				}),
				cashbackModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,[Op.or]: [{title: {[Op.like]: "%" + data.search + "%",}}],
					validity_for: { 
						[Op.gt]: currentDate
					},}
				}).then(async CashbackData => {
					if (CashbackData.length > 0){
						const dataArray = [];
						for(const data of CashbackData){
						let result = 	JSON.parse(JSON.stringify(data));
						result.type="cashbacks";
						dataArray.push(result);
						}
						return dataArray;
					}
					return [];		
				}),
				discountModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,[Op.or]: [{title: {[Op.like]: "%" + data.search + "%",}}],
					validity_for: { 
						[Op.gt]: currentDate
					},}
				}).then(async DiscountData => {
						if (DiscountData.length > 0){
							const dataArray = [];
							for(const data of DiscountData){
								let result = 	JSON.parse(JSON.stringify(data));
								result.type="discounts";
								dataArray.push(result);
								}
								return dataArray;
						}
					return [];
				}),
				couponeModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,[Op.or]: [{title: {[Op.like]: "%" + data.search + "%",}}],
					expire_at: { 
						[Op.gt]: currentDate
					},}
				}).then(async CouponeData => {
					if (CouponeData.length > 0){
						const dataArray = [];
						for(const data of CouponeData){
						let result = 	JSON.parse(JSON.stringify(data));
						result.type="coupones";
						dataArray.push(result);
						}
						return dataArray;
						
					}
					return [];
				}),
				loyaltyPointModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,[Op.or]: [{name: {[Op.like]: "%" + data.search + "%",}}],
					validity: { 
						[Op.gt]: currentDate
					},}
					}).then(async LoyaltyPointData => {
						if(LoyaltyPointData.length  > 0){
							const dataArray = [];
							for(const data of LoyaltyPointData){
								let result = 	JSON.parse(JSON.stringify(data));
								result.type="loyalty_points";
								dataArray.push(result);
						}
						return dataArray;
						}
						return [];
				})
			);

			const [giftcardRewards,cashbackData,discountData,couponeData,loyaltyPointData] = await Promise.all(promises);

			const arrays = [giftcardRewards, cashbackData,discountData,couponeData,loyaltyPointData];
			const mergedArray = mergeRandomArrayObjects(arrays);
			let result =  mergedArray.slice(skip, skip+limit);
			// for(let data of result){
			// 	console.log(data.type)
			// }
			if(!(_.isEmpty(request_type))){
				result = _.filter(result, {type: request_type})
			}
			// 	result.totalRecord = mergedArray.length || 0;
			res.send(setRes(resCode.OK, true, "Get rewards detail successfully.",result))
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
// List Rewards END

// View Rewards START
exports.commonRewardsView =async(req,res) => {
	try{
		var data = req.params
		var paramType = req.query.type
		var giftCardModel = models.gift_cards
		var cashbackModel = models.cashbacks
		var discountModel = models.discounts
		var couponeModel = models.coupones
		var loyaltyPointModel = models.loyalty_points
		var Op = models.Op
		var currentDate = (moment().format('YYYY-MM-DD'))

		var typeArr = ['gift_cards','cashbacks','discounts','coupones','loyalty_points'];
		if((paramType) && !(typeArr.includes(paramType))){
			return res.send(setRes(resCode.BadRequest, null, false, "Please select valid type."))
		}else{
			if(paramType == 'gift_cards') {
				giftCardModel.findOne({
					where:{
						id:data.id,
						status:true,
						isDeleted:false,
						expire_at: { 
							[Op.gt]: currentDate
						},
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
			
			}else if(paramType == 'cashbacks') {
				cashbackModel.findOne({
					where:{id:data.id,status:true,isDeleted:false,validity_for: { 
						[Op.gt]: currentDate
					},}
				}).then(async cashbackData => {
					if (cashbackData != null){
						res.send(setRes(resCode.OK, true, "Get cashbacks detail successfully.",cashbackData))
					}
					else{
						res.send(setRes(resCode.ResourceNotFound,false, "Cashback not found.",null))
					}
				}).catch(error3 => {
					res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
				})
			}else if(paramType == 'discounts'){
				discountModel.findOne({
					where:{id:data.id,status:true,isDeleted:false,deleted_at:null,validity_for: { 
						[Op.gt]: currentDate
					},}
				}).then(async discountData => {
					if (discountData != null){
						res.send(setRes(resCode.OK, true, "Get Discount detail successfully.",discountData))
					}
					else{
						res.send(setRes(resCode.ResourceNotFound,false, "Discount not found.",null))
					}
				}).catch(error4 => {
					res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
				})
			}else if(paramType == 'coupones'){
				couponeModel.findOne({
					where:{id:data.id,status:true,isDeleted:false,deleted_at:null,expire_at: { 
						[Op.gt]: currentDate
					},}
				}).then(async couponeData => {
					if (couponeData != null){
						res.send(setRes(resCode.OK, true, "Get Coupones detail successfully.",couponeData))
					}
					else{
						res.send(setRes(resCode.ResourceNotFound,false, "Coupon not found.",null))
					}
				}).catch(error5 => {
					res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
				})
			}else if(paramType == 'loyalty_points'){
				loyaltyPointModel.findOne({
					where:{id:data.id,status:true,isDeleted:false,deleted_at:null,validity: { 
						[Op.gt]: currentDate
					},}
				}).then(async loyaltyPointData => {
					if (loyaltyPointData != null){
						res.send(setRes(resCode.OK, true, "Get loyalty point detail successfully.",loyaltyPointData))
					}
					else{
						res.send(setRes(resCode.ResourceNotFound,false, "loyalty point not found.",null))
					}
				}).catch(error2 => {
					res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
				})
			}else {
				res.send(setRes(resCode.BadRequest, null, false, "Please select valid type."))
			}
		}
		
	}catch(error){
		console.log(error)
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}
// View Rewards END