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
			const giftCardName = data?.name?.trim() || data.name;
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
										[Op.eq]: giftCardName
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
			const giftCardName = data?.name?.trim() || data.name;
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
							where: { isDeleted: false, status: true, name: { [Op.eq]: giftCardName }, id: { [Op.ne]: data.id } }
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
/** 
 * Older reward list api is not in use 
 */
exports.commonRewardsListOlder =async(req,res) => {
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
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,[Op.or]: [{name: {[Op.like]: "%" + data.search + "%",}}],}
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
							if(result.expire_at < currentDate){
								result.expire_status = 1;
							}else{
								result.expire_status = 0;
							}
							result.type="gift_cards";
							dataArray.push(result);
						}
						return dataArray;
					}
					return [];
				}),
				cashbackModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,[Op.or]: [{title: {[Op.like]: "%" + data.search + "%",}}],}
				}).then(async CashbackData => {
					if (CashbackData.length > 0){
						const dataArray = [];
						for(const data of CashbackData){
						let result = 	JSON.parse(JSON.stringify(data));
						if(result.validity_for < currentDate){
							result.expire_status = 1;
						}else{
							result.expire_status = 0;
						}
						result.type="cashbacks";
						dataArray.push(result);
						}
						return dataArray;
					}
					return [];		
				}),
				discountModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,[Op.or]: [{title: {[Op.like]: "%" + data.search + "%",}}],}
				}).then(async DiscountData => {
						if (DiscountData.length > 0){
							const dataArray = [];
							for(const data of DiscountData){
								let result = 	JSON.parse(JSON.stringify(data));
								if(result.validity_for < currentDate){
									result.expire_status = 1;
								}else{
									result.expire_status = 0;
								}
								result.type="discounts";
								dataArray.push(result);
								}
								return dataArray;
						}
					return [];
				}),
				couponeModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,[Op.or]: [{title: {[Op.like]: "%" + data.search + "%",}}],}
				}).then(async CouponeData => {
					if (CouponeData.length > 0){
						const dataArray = [];
						for(const data of CouponeData){
						let result = 	JSON.parse(JSON.stringify(data));
						if(result.expire_at < currentDate){
							result.expire_status = 1;
						}else{
							result.expire_status = 0;
						}
						result.type="coupones";
						dataArray.push(result);
						}
						return dataArray;
						
					}
					return [];
				}),
				loyaltyPointModel.findAll({
					where:{isDeleted:false,status:true,business_id:data.business_id,deleted_at: null,[Op.or]: [{name: {[Op.like]: "%" + data.search + "%",}}],}
					}).then(async LoyaltyPointData => {
						if(LoyaltyPointData.length  > 0){
							const dataArray = [];
							for(const data of LoyaltyPointData){
								let result = 	JSON.parse(JSON.stringify(data));
								if(result.validity < currentDate){
									result.expire_status = 1;
								}else{
									result.expire_status = 0;
								}
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
			if(!(_.isEmpty(request_type))){
				result = _.filter(result, {type: request_type})
			}
			let resData = {};
			resData.total_rewards_purchase = "";
			resData.total_loyalty_purchase = "";
			resData.rewards_and_loyalty = result;
			res.send(setRes(resCode.OK, true, "Get rewards detail successfully.",resData))
		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

/**
 * 	Wallet Reward Latest api
 */
exports.commonRewardsList =async(req,res) => {
	try{
		const data = req.body
		const giftCardModel = models.gift_cards
		const cashbackModel = models.cashbacks
		const discountModel = models.discounts
		const couponeModel = models.coupones
		const loyaltyPointModel = models.loyalty_points
		const productCategoryModel = models.product_categorys;
		const productModel = models.products;
		const businessModel = models.business;
		const Op = models.Op;
		const currentDate = (moment().format('YYYY-MM-DD'))
		const requiredFields = _.reject(['page'], (o) => { return _.has(data, o)  })
		const businessEmail = req.userEmail;
		const businessDetails = await businessModel.findOne({ where: { email: businessEmail, is_active: true, is_deleted: false } });
		const businessId = businessDetails?.id || '';
		const businessIdCond = { business_id: businessId };
		if(requiredFields == ""){
			if(!data?.page || +(data.page) <= 0) {
				return res.send(setRes(resCode.BadRequest, null, false, "invalid page number, should start with 1"))
			}
			var typeArr = ['gift_cards','cashbacks','discounts','coupones','loyalty_points'];
			let request_type = data?.type?.includes(',') && data?.type?.split(',').length > 0 ? data?.type?.split(',') : (data?.type && data?.type?.trim() !== '' ? [data?.type] : typeArr );
			request_type = request_type.filter( tp => tp && tp.trim() !== '');
			const requestTypeNotExists = request_type.filter( tp => !typeArr.includes(tp) && tp !== '' );
			if(request_type && requestTypeNotExists.length !== 0){
				return res.send(setRes(resCode.BadRequest, null, false, "Please select valid type."))
			}
			// if((request_type) && !(typeArr.includes(request_type))){
			// 	return res.send(setRes(resCode.BadRequest, null, false, "Please select valid type."))
			// }

			// Total limit for all records
			const limit = 15;
			const perTableLimit = Math.ceil(limit / (request_type.length || 5)) ;
			const lastTableLimit = (request_type.length % 2) != 0 ?  perTableLimit : perTableLimit - 1;
			const giftCardLoyaltyCondition =  data.search ? {
				[Op.or]: [
					{
						name: {
							[Op.like]: "%" + data.search + "%",
						}
					}
				]
			} : {}

			const cashBackDiscountCouponCondition = data.search ? {
				[Op.or]: [
					{
						title: {
							[Op.like]: "%" + data.search + "%",
						}
					}
				],
			} : {};


			let giftCardsRecords, cashbackRecords,discountRecords,couponeRecords,loyaltyRecords;
			let remainingGiftcardRecordLimit = 0, remainingCashbackRecordLimit = 0,remainingDiscountRecordLimit=0,remainingCouponRecordLimit=0;
			/**
			 * Fetch Gift cards and calculate and forward to next module not fetched record limit 
			 */
			if (request_type.includes('gift_cards')) {
				giftCardsRecords = await giftCardModel.findAndCountAll({
					offset: perTableLimit * (data.page - 1),
					limit: perTableLimit,
					where:{
						isDeleted: false,
						status: true,
						...businessIdCond,
						...giftCardLoyaltyCondition					
					},
					attributes: {
						include: [[models.sequelize.literal("'gift_cards'"),"type"]]
					},
					order: [
						['createdAt', 'DESC']
					]
				});
				const tempGiftCardsRecords = [];
				for(let data of giftCardsRecords?.rows || []){
					let gCard = JSON.parse(JSON.stringify(data));
					if(gCard.image && gCard.image != null){
						let images = gCard.image
						const signurl = await awsConfig.getSignUrl(images.toString()).then(function(res){
							gCard.image = res;
						});
					}else {
						gCard.image = commonConfig.default_image;
					}
					if(gCard.expire_at < currentDate){
						gCard["is_expired"] = true;
					}else{
						gCard["is_expired"] = false;
					}
					tempGiftCardsRecords.push(gCard);
				}
				giftCardsRecords.rows = tempGiftCardsRecords;
				const fetchedGiftCardsCount = giftCardsRecords?.rows?.length || 0 ;
				remainingGiftcardRecordLimit = perTableLimit - fetchedGiftCardsCount > 0 ? perTableLimit - fetchedGiftCardsCount : 0 ;
			}
			

			/**
			 * Fetch Cashback records and calculate and forward to next module not fetched record limit 
			 */
			if (request_type.includes('cashbacks')) {
				cashbackRecords = await cashbackModel.findAndCountAll({
					offset: perTableLimit * (data.page - 1),
					limit: perTableLimit + remainingGiftcardRecordLimit,
					where: {
						isDeleted: false,
						status: true,
						...businessIdCond,
						...cashBackDiscountCouponCondition
					},
					attributes: {
						include: [[models.sequelize.literal("'cashbacks'"),"type"]]
					},
					include: [
						{
							model: productCategoryModel,
							attributes: ['id', 'name']
						}
					],
					order: [
						['createdAt', 'DESC']
					]
				});
				const tempCashbackRecords = [];
				for(const data of cashbackRecords?.rows || []){
					let cashBackObj = JSON.parse(JSON.stringify(data));
					const products = await productModel.findAll({ where: { id: { [Op.in] : cashBackObj.product_id?.split(',') || [] } } ,attributes: ["name"], raw: true});
					const product_name_arr = products?.map(val => val.name);
					const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
					cashBackObj.product_name = product_name;
					cashBackObj.product_category_name = cashBackObj?.product_category?.name || ''
					cashBackObj.value_type = cashBackObj.cashback_type;
					cashBackObj.amount = cashBackObj.cashback_value;
					delete cashBackObj.product_category;
					if(cashBackObj.validity_for < currentDate){
						cashBackObj.is_expired = true;
					}else{
						cashBackObj.is_expired = false;
					}
					tempCashbackRecords.push(cashBackObj);
				}
				cashbackRecords.rows = tempCashbackRecords;
				const fetchedCashbackCount = cashbackRecords?.rows?.length || 0 ;
				remainingCashbackRecordLimit = (perTableLimit + remainingGiftcardRecordLimit) - fetchedCashbackCount > 0 ? (perTableLimit + remainingGiftcardRecordLimit) - fetchedCashbackCount : 0 ;
			}
			// -----------------------------------------------------------------------------

			/**
			 * Fetch discount records and calculate and forward to next module not fetched record limit 
			 */
			if (request_type.includes('discounts')) {
				discountRecords = await discountModel.findAndCountAll({
					offset: perTableLimit * (data.page - 1),
					limit: perTableLimit + remainingCashbackRecordLimit,
					where:{
						isDeleted:false,
						status:true,
						...businessIdCond,
						...cashBackDiscountCouponCondition
					},
					attributes: {
						include: [[models.sequelize.literal("'discounts'"),"type"]]
					},
					include: [
						{
							model: productCategoryModel,
							attributes: ['id', 'name']
						}
					],
					order: [
						['createdAt', 'DESC']
					]
				});
				const tempDiscountRecords = [];
				for(const data of discountRecords?.rows || []){
					let discountObj = JSON.parse(JSON.stringify(data));
					const products = await productModel.findAll({ where: { id: { [Op.in] : discountObj.product_id?.split(',') || [] } } ,attributes: ["name"], raw: true});
					const product_name_arr = products?.map(val => val.name);
					const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
					discountObj.product_name = product_name;
					discountObj.product_category_name = discountObj?.product_category?.name || ''
					discountObj.value_type = discountObj.discount_type;
					discountObj.amount = discountObj.discount_value;
					delete discountObj.product_category;
					if(discountObj.validity_for < currentDate){
						discountObj.is_expired = true;
					}else{
						discountObj.is_expired = false;
					}
					tempDiscountRecords.push(discountObj);
				}
				discountRecords.rows = tempDiscountRecords;

				const fetchedDiscountCount = discountRecords?.rows?.length || 0 ;
				remainingDiscountRecordLimit = (perTableLimit + remainingCashbackRecordLimit) - fetchedDiscountCount > 0 ? (perTableLimit + remainingCashbackRecordLimit) - fetchedDiscountCount : 0 ;
			}
			// -----------------------------------------------------------------------------

			/**
			 *  Fetch coupon records and calculate and forward to next module not fetched record limit 
			 */
			if (request_type.includes('coupones')) {
				couponeRecords = await couponeModel.findAndCountAll({
					offset: perTableLimit * (data.page - 1),
					limit: perTableLimit + remainingDiscountRecordLimit,
					where:{
						isDeleted:false,
						status:true,
						...businessIdCond,
						...cashBackDiscountCouponCondition
					},
					attributes: {
						include: [[models.sequelize.literal("'coupones'"),"type"]]
					},
					include: [
						{
							model: productCategoryModel,
							attributes: ['id', 'name']
						}
					],
					order: [
						['createdAt', 'DESC']
					]
				});
				const tempCouponesRecords = [];
				for(const data of couponeRecords?.rows || []){
					let couponeObj = JSON.parse(JSON.stringify(data));
					const products = await productModel.findAll({ where: { id: { [Op.in] : couponeObj.product_id?.split(',') || [] } } ,attributes: ["name"], raw: true});
					const product_name_arr = products?.map(val => val.name);
					const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
					couponeObj.product_name = product_name;
					couponeObj.product_category_name = couponeObj?.product_category?.name || ''
					couponeObj.amount = couponeObj.coupon_value;
					delete couponeObj.product_category;
					if(couponeObj.expire_at < currentDate){
						couponeObj.is_expired = true;
					}else{
						couponeObj.is_expired = false;
					}
					tempCouponesRecords.push(couponeObj);
				}
				couponeRecords.rows = tempCouponesRecords;
				const fetchedCouponCount = couponeRecords?.rows?.length || 0 ;
				remainingCouponRecordLimit = (perTableLimit + remainingDiscountRecordLimit) - fetchedCouponCount > 0 ? (perTableLimit + remainingDiscountRecordLimit) - fetchedCouponCount : 0 ;
			}
			// -----------------------------------------------------------------------------

			/**
			 * Fetch loyalty records
			 */
			if (request_type.includes('loyalty_points')) {
				loyaltyRecords = await loyaltyPointModel.findAndCountAll({
					offset: lastTableLimit * (data.page - 1),
					limit: lastTableLimit + remainingCouponRecordLimit,
					where:{
						isDeleted:false,
						status:true,
						...businessIdCond,
						...giftCardLoyaltyCondition
					},
					attributes: {
						include: [[models.sequelize.literal("'loyalty_points'"),"type"]]
					},
					include: [
						{
							model: productModel,
							attributes: ['id', 'name', 'category_id'],
							include: [
								{
									model: productCategoryModel,
									attributes: ['id', 'name'],
									as: 'product_categorys'
								}
							],
						}
					],
					order: [
						['createdAt', 'DESC']
					]
				});
				const tempLoyaltyRecords = [];
				for(const data of loyaltyRecords?.rows || []){
					let loyaltyObj = JSON.parse(JSON.stringify(data));
					loyaltyObj.product_name = loyaltyObj?.product?.name || '';
					loyaltyObj.product_category_name = loyaltyObj?.product?.product_categorys?.name || '';
					delete loyaltyObj?.product;
					if(loyaltyObj.validity < currentDate){
						loyaltyObj.is_expired = true;
					}else{
						loyaltyObj.is_expired = false;
					}
					tempLoyaltyRecords.push(loyaltyObj);
				}
				loyaltyRecords.rows = tempLoyaltyRecords;
			}

			
			// const fetchedLoyaltyCount = loyaltyRecords?.rows?.length || 0 ;
			// const remainingLoyaltyRecordLimit = (perTableLimit + remainingCouponRecordLimit) - fetchedLoyaltyCount > 0 ? (perTableLimit + remainingCouponRecordLimit) - fetchedLoyaltyCount : 0 ;
			// -----------------------------------------------------------------------------


			const fetchedGiftCardsRecords = giftCardsRecords?.rows || [];
			const totalGiftCardRecords = giftCardsRecords?.count || 0;

			const fetchedCashbackRecords = cashbackRecords?.rows || [];
			const totalCashbackRecords = cashbackRecords?.count || 0;

			const fetchedDiscountRecords = discountRecords?.rows || [];
			const totalDiscountRecords = discountRecords?.count || 0;
			
			const fetchedCouponRecords = couponeRecords?.rows || [];
			const totalCouponRecords = couponeRecords?.count || 0;
			
			const fetchedLoyaltyRecords = loyaltyRecords?.rows || [];
			const totalLoyaltyRecords = loyaltyRecords?.count || 0;


			const total_records = totalGiftCardRecords + totalCashbackRecords + totalDiscountRecords + totalCouponRecords + totalLoyaltyRecords;
			const totalPages = Math.ceil(total_records / limit);
			const currentPage = +(data.page)
			const per_page = limit;
			const lastPage = totalPages;
			const previousPage = currentPage - 1 <= 0 ? null : (currentPage - 1);
			const nextPage = currentPage + 1 > lastPage ?  null : (currentPage + 1);

			const arrays = [...fetchedGiftCardsRecords, ...fetchedCashbackRecords, ...fetchedDiscountRecords, ...fetchedCouponRecords, ...fetchedLoyaltyRecords];

			// const [giftcardRewards,cashbackData,discountData,couponeData,loyaltyPointData] = await Promise.all(promises);

			// const arrays = [giftcardRewards, cashbackData,discountData,couponeData,loyaltyPointData];

			// const mergedArray = mergeRandomArrayObjects(arrays);
			// let result =  mergedArray.slice(skip, skip+limit);

			const sortedArray = sortByCreatedLatest(arrays);
			const result = sortedArray;
			// if(!(_.isEmpty(request_type))){
			// 	result = _.filter(result, {type: request_type})
			// }
			let resData = {};
			resData.total_rewards_purchase = "";
			resData.total_loyalty_purchase = "";
			resData.data = result;

			resData.total_records = total_records;
			resData.totalPages = totalPages;
			resData.currentPage = currentPage;
			resData.per_page = per_page;
			resData.nextPage = nextPage;
			resData.previousPage = previousPage;
			resData.lastPage = lastPage;

			res.send(setRes(resCode.OK, true, "Get rewards list successfully",resData))
		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

function sortByCreatedLatest (arrays) {
	const sortedArray  = arrays.sort((a,b) => new moment(b.createdAt) - new moment(a.createdAt));
	return sortedArray;
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
					where:{id:data.id,status:true,isDeleted:false}
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
					where:{id:data.id,status:true,isDeleted:false,deleted_at:null,}
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
					where:{id:data.id,status:true,isDeleted:false,deleted_at:null}
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
					where:{id:data.id,status:true,isDeleted:false,deleted_at:null}
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
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}
// View Rewards END