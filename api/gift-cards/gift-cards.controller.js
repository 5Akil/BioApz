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
const pagination = require('../../helpers/pagination');


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
			}else if(!Number(data.amount) || isNaN(data.amount) || data.amount <= 0 ){
				res.send(setRes(resCode.BadRequest,false, "Amount value should be greater than 0!",null))
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
		const userGiftCardList = models.user_giftcards;
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
			} else if(!Number(data.amount) || isNaN(data.amount) || data.amount <= 0 ){
				res.send(setRes(resCode.BadRequest,false, "Amount value should be greater than 0!",null))
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
							if (data?.is_cashback == 0) {
								data.cashback_percentage = null;
							}
							if (giftCardData == null) {
								giftCardModel.update(data,
									{
										where: { id: data.id, isDeleted: false, status: true }
									}).then(async updateData => {
										if (data.image != null) {
											const params = { Bucket: awsConfig.Bucket, Key: giftCardDetail.image }; awsConfig.deleteImageAWS(params)
										}
										if (updateData) {
											giftCardModel.findOne({
												where: { id: data.id, isDeleted: false, status: true },
												include: [
													{
														model: userGiftCardList,
														attributes: ['id'],
														where: {
															payment_status: 1
														},
														required: false
													}
												]
											}).then(async updatedGiftCardDetail => {
												if (data.image != null) {
													var updateData_image = await awsConfig.getSignUrl(updatedGiftCardDetail.image).then(function (res) {
														updatedGiftCardDetail.image = res;
													})
												} else if (updatedGiftCardDetail.image != null) {
													var updateData_image = await awsConfig.getSignUrl(updatedGiftCardDetail.image).then(function (res) {
														updatedGiftCardDetail.image = res;
													})
												}
												else {
													updatedGiftCardDetail.image = awsConfig.default_image;
												}
												const curentDate = (moment().format('YYYY-MM-DD'));
												if(updatedGiftCardDetail.dataValues.expire_at < curentDate){
													updatedGiftCardDetail.dataValues.is_expired = true;
												}else{
													updatedGiftCardDetail.dataValues.is_expired = false;
												}
												updatedGiftCardDetail.dataValues.type = "gift_cards";
												updatedGiftCardDetail.dataValues.totalPurchase = updatedGiftCardDetail?.dataValues?.user_giftcards?.length  || 0; 
												delete updatedGiftCardDetail?.dataValues?.user_giftcards;

												res.send(setRes(resCode.OK, true, 'Gift card update successfully', updatedGiftCardDetail))
											})
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

// LIST Gift Cards 
exports.giftCardLists = async (req, res) => {
	try {
		const query = req.query;
		const business_id = query?.business_id || '';
		const giftCardsModel = models.gift_cards;

		const giftCards = await giftCardsModel.findAll({
			where: {
				business_id,
				status: true,
				isDeleted: false,
				expire_at:{
					[Op.gte] : moment().format('YYYY-MM-DD')
				},
			},
			attributes: { exclude: ["status", "isDeleted", "createdAt", "updatedAt", "deleted_at"] }
		});
		res.send(setRes(resCode.OK, true, "Gift Cards List.", giftCards));
	} catch (error) {
		res.send(setRes(resCode.BadRequest, false, null, "Please select valid type."));
	}
}

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
exports.commonRewardsListOld =async(req,res) => {
	try{
		const data = req.body
		const giftCardModel = models.gift_cards
		const userGiftCardList = models.user_giftcards;
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
		const businessIdCond = data?.business_id ? { business_id: data?.business_id }: { business_id: businessId };
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
					include: [
						{
							model: userGiftCardList,
							attributes: ['id'],
							where: {
								payment_status: 1
							},
							required: false
						}
					],
					where:{
						isDeleted: false,
						status: true,
						...businessIdCond,
						...giftCardLoyaltyCondition					
					},
					attributes: {
						include: [
							[models.sequelize.literal("'gift_cards'"),"type"],
						]
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
					gCard.totalPurchase = gCard.user_giftcards.length  || 0; 
					delete gCard.user_giftcards;
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
						},
						{
							model: giftCardModel,
							attributes: ['id', 'name'],
						}
					],
					order: [
						['createdAt', 'DESC']
					]
				});
				const tempLoyaltyRecords = [];
				for(const data of loyaltyRecords?.rows || []){
					let loyaltyObj = JSON.parse(JSON.stringify(data));
					// loyaltyObj.product_name = loyaltyObj?.product?.name || '';
					loyaltyObj.product_category_name = loyaltyObj?.product?.product_categorys?.name || '';
					const products = await productModel.findAll({ where: { id: { [Op.in] : loyaltyObj.product_id?.split(',') || [] } } ,attributes: ["name"], raw: true});
					const product_name_arr = products?.map(val => val.name);
					const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
					loyaltyObj.product_name = product_name;

					loyaltyObj.giftcard_name = loyaltyObj?.gift_card?.name || '';
					delete loyaltyObj?.gift_card;
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
		//console.log('error', error);
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}

exports.commonRewardsList =async(req,res) => {
	try{
		const data = req.body
		const giftCardModel = models.gift_cards
		const userGiftCardList = models.user_giftcards;
		const cashbackModel = models.cashbacks
		const discountModel = models.discounts
		const couponeModel = models.coupones
		const loyaltyPointModel = models.loyalty_points
		const productCategoryModel = models.product_categorys;
		const productModel = models.products;
		const businessModel = models.business;
		const rewardHistoryModel = models.reward_history;
		const userModel = models.user;
		const orderModel = models.orders
		const Op = models.Op;

		const user = req?.user || {};
		
		const currentDate = (moment().format('YYYY-MM-DD'))
		const requiredFields = _.reject(['page'], (o) => { return _.has(data, o)  })
		const businessEmail = req.userEmail;
		const businessDetails = await businessModel.findOne({ where: { email: businessEmail, is_active: true, is_deleted: false } });
		const businessId = businessDetails?.id || '';

		let total_rewards_purchase = "0";
		let total_loyalty_purchase = "0" ;
		let total_cashbacks = "0";
		let total_loyalty_points = "0";
		if (user.role_id == '2') {
			const userDetails = await userModel.findOne({
				where: {
					id: user.id
				}
			});
			const total_rewards = userDetails?.dataValues?.total_cashbacks ? userDetails?.dataValues?.total_cashbacks : "0" ;
			const total_loyalty =  userDetails?.dataValues?.total_loyalty_points ? userDetails?.dataValues?.total_loyalty_points : "0";
			total_cashbacks = total_rewards;
			total_loyalty_points = total_loyalty;
		}
		if (user.role_id == '3') {
			const businessRewardsDetails = await rewardHistoryModel.findAll({
				include: [
					{
						model: orderModel,
						attributes: [],
						where: {
							business_id: businessId
						},
						required: true
					}
				],
				attributes: [[models.sequelize.fn('sum', models.sequelize.col('reward_history.amount')), 'total_rewards']],
				where: {
					reference_reward_type: { [Op.ne] : 'loyalty_points' }
				}
			});
			const businessLoyaltyDetails = await rewardHistoryModel.findAll({
				include: [
					{
						model: orderModel,
						where: {
							business_id: businessId
						},
						required: true
					}
				],
				attributes: [[models.sequelize.fn('sum', models.sequelize.col('reward_history.amount')), 'total_loyalty']],
				where: {
					reference_reward_type: { [Op.eq] : 'loyalty_points' }
				}
			});
			total_rewards_purchase = businessRewardsDetails[0]?.dataValues?.total_rewards ? businessRewardsDetails[0].dataValues.total_rewards : "0";
			total_loyalty_purchase = businessLoyaltyDetails[0]?.dataValues?.total_loyalty ? businessLoyaltyDetails[0].dataValues.total_loyalty : "0";
		}
		// const businessIdCond = data?.business_id ? `AND business_id="${data.business_id}"` : `AND business_id="${businessId}"`;
		const businessIdCond = (tableName) => data?.business_id ? `AND ${tableName}.business_id="${data.business_id}"` : `AND ${tableName}.business_id="${businessId}"`;

		if (requiredFields == '') {
			const limit = 15; 
			const offset = (data.page >= 1)  ? (data.page - 1) * limit : 0

			const typeArr = ['gift_cards','cashbacks','discounts','coupones','loyalty_points'];
			let request_type = data?.type?.includes(',') && data?.type?.split(',').length > 0 ? data?.type?.split(',') : (data?.type && data?.type?.trim() !== '' ? [data?.type] : typeArr );

			let unionQuery = '';
			
			const giftCardAndLoyaltyCond = data.search ? ` AND name LIKE "%${data.search}%"` : '';
			const cashbackDiscountCouponCond = data.search ? `AND title LIKE "%${data.search}%"` : '';
			
			const giftLoyaltyWhereClause = (tableName) => `isDeleted=false AND status=true ${giftCardAndLoyaltyCond} ${businessIdCond(tableName)}`;
			const cashbackDiscountCouponWhereClause = (tableName) => `isDeleted=false AND status=true ${cashbackDiscountCouponCond} ${businessIdCond(tableName)}`;

			let filteCondition = '';
			if ( data.category_id != undefined && data.category_id ) {
				const category = data.category_id ? data.category_id.trim(): '' ;
				filteCondition += ` products.category_id IN (${category})`;
			}

			if ( data.product_type != undefined && data.product_type ) {
				const productType = data.product_type ? data.product_type.trim() : '' ;
				const condition = `products.sub_category_id IN (${productType})`
				filteCondition += filteCondition != '' ?  ` AND ${condition}` :  condition;
			}
			if (data.price != undefined && data.price) {
				const priceRange = data.price != '' ? data.price.split('-') : [];
				const lowerRange = priceRange.length > 1 ? priceRange[0] : 0;
				const upperRange = priceRange.length > 1 ? priceRange[1] : 0;
				let condition = `products.price >= ${lowerRange} `;
				if (upperRange - lowerRange  != 1) {
					condition += `AND  products.price <= ${upperRange}`;
				}
				filteCondition += filteCondition != '' ?  ` AND ${condition}` :  condition;
			}

			const productFilterCondition = (tableName) => `JOIN products ON FIND_IN_SET(products.id, product_id) > 0 WHERE ${filteCondition}`

			const giftCardQuery = `SELECT gift_cards.id, gift_cards.createdAt, "gift_cards" as type FROM gift_cards WHERE ${giftLoyaltyWhereClause('gift_cards') }`;
			const cashbackQuery = `SELECT cashbacks.id, cashbacks.createdAt, "cashbacks" as type FROM cashbacks ${filteCondition != '' ? productFilterCondition('cashbacks') : ''} ${filteCondition != '' ? 'AND '+cashbackDiscountCouponWhereClause('cashbacks') : 'WHERE '+cashbackDiscountCouponWhereClause('cashbacks') }`;
			const discountQuery = `SELECT discounts.id, discounts.createdAt, "discounts" as type FROM discounts ${filteCondition != '' ? productFilterCondition('discounts') : ''} ${filteCondition != '' ? 'AND '+cashbackDiscountCouponWhereClause('discounts') : 'WHERE '+cashbackDiscountCouponWhereClause('discounts') }`;
			const couponesQuery = `SELECT coupones.id, coupones.createdAt, "coupones" as type FROM coupones ${filteCondition != '' ? productFilterCondition('coupones') : ''} ${filteCondition != '' ? 'AND '+cashbackDiscountCouponWhereClause('coupones') : 'WHERE '+cashbackDiscountCouponWhereClause('coupones') }`;
			const loyaltyPointsQuery = `SELECT loyalty_points.id, loyalty_points.createdAt, "loyalty_points" as type FROM loyalty_points ${filteCondition != '' ? productFilterCondition('loyalty_points') : ''} ${filteCondition != '' ? 'AND '+giftLoyaltyWhereClause('loyalty_points') : 'WHERE '+giftLoyaltyWhereClause('loyalty_points') }`;
			
			if (request_type.includes('gift_cards')) {
				unionQuery += giftCardQuery;
			}
			
			if (request_type.includes('cashbacks')) {
				unionQuery += unionQuery != '' ?  ` UNION ${cashbackQuery}`: cashbackQuery;
			}
			
			if (request_type.includes('discounts')) {
				unionQuery += unionQuery != '' ?  ` UNION ${discountQuery}`: discountQuery;
			}
			
			if (request_type.includes('coupones')) {
				unionQuery += unionQuery != '' ?  ` UNION ${couponesQuery}`: couponesQuery;
			}
			
			if (request_type.includes('loyalty_points')) {
				unionQuery += unionQuery != '' ?  ` UNION ${loyaltyPointsQuery}`: loyaltyPointsQuery;
			}
			// unionQuery += `${unionQuery}`
			let rewards = [];
			let rewardsCounts = [];
			if (user.role_id == 3) {
			rewards = await models.sequelize.query(`SELECT * FROM (${unionQuery}) Rewards ${filteCondition != '' ? 'GROUP BY id' : ''} ORDER BY createdAt desc LIMIT ${offset}, ${limit}`,{
				type: models.sequelize.QueryTypes.SELECT
			});
			rewardsCounts = await models.sequelize.query(`SELECT * FROM (${unionQuery}) Rewards ${filteCondition != '' ? 'GROUP BY id' : ''}`,{
				type: models.sequelize.QueryTypes.SELECT
			})
			} // for user's rewards
			else {
			const textSearch = (tableName) =>  {
				if (['gift_cards','loyalty_points'].includes(tableName)) {
					return data.search ? ` AND ${tableName}.name LIKE "%${data.search}%"` : '';
				} 
				if (['cashbacks','discounts','coupones'].includes(tableName)){
					return data.search ? `AND ${tableName}.title LIKE "%${data.search}%"` : '';
				}
			}

			const userGiftCardQuery = `SELECT user_giftcards.gift_card_id as "id", user_giftcards.createdAt, "gift_cards" as type, user_giftcards.id as "user_giftcard_id"  FROM user_giftcards JOIN gift_cards ON user_giftcards.gift_card_id=gift_cards.id WHERE ((user_id=${user?.id} and to_email is null) OR (to_email = '${user?.user}')) AND user_giftcards.is_deleted=false AND user_giftcards.status=true ${textSearch('gift_cards')}`;
			// const userRewardQuery = `SELECT user_earned_rewards.reference_reward_id, createdAt, user_earned_rewards.reference_reward_type as "type"  FROM user_earned_rewards WHERE user_id=${user?.id}`;
			const productFilter = (tableName) => `JOIN ${tableName} ON user_earned_rewards.reference_reward_id=${tableName}.id ${filteCondition != '' ? `JOIN products ON FIND_IN_SET(products.id, ${tableName}.product_id) > 0` : ''} WHERE ${filteCondition} ${filteCondition !== '' ? 'AND' : ''} user_id=${user?.id} AND reference_reward_type='${tableName}' ${textSearch(tableName)} ${ filteCondition !== '' ? 'GROUP BY user_earned_rewards.id' : ''}`

			const userCashbackRewardQuery = `SELECT user_earned_rewards.reference_reward_id as "id", user_earned_rewards.createdAt, user_earned_rewards.reference_reward_type as "type", null as "user_giftcard_id"  FROM user_earned_rewards ${productFilter('cashbacks')}`;
			const userDiscountRewardQuery = `SELECT user_earned_rewards.reference_reward_id as "id", user_earned_rewards.createdAt, user_earned_rewards.reference_reward_type as "type", null as "user_giftcard_id"  FROM user_earned_rewards ${productFilter('discounts')}`;
			const userCouponesRewardQuery = `SELECT user_earned_rewards.reference_reward_id as "id", user_earned_rewards.createdAt, user_earned_rewards.reference_reward_type as "type", null as "user_giftcard_id"  FROM user_earned_rewards ${productFilter('coupones')}`;
			const userLoyaltyRewardQuery = `SELECT user_earned_rewards.reference_reward_id as "id", user_earned_rewards.createdAt, user_earned_rewards.reference_reward_type as "type", null as "user_giftcard_id"  FROM user_earned_rewards ${productFilter('loyalty_points')}`;
			
			let userUnionQuery = '';
			// const userUnionQuery = `${userGiftCardQuery} UNION ${userRewardQuery}`;
			if (request_type.includes('gift_cards')) {
				userUnionQuery += userGiftCardQuery;
			}
			
			if (request_type.includes('cashbacks')) {
				userUnionQuery += userUnionQuery != '' ?  ` UNION ${userCashbackRewardQuery}`: userCashbackRewardQuery;
			}
			
			if (request_type.includes('discounts')) {
				userUnionQuery += userUnionQuery != '' ?  ` UNION ${userDiscountRewardQuery}`: userDiscountRewardQuery;
			}
			
			if (request_type.includes('coupones')) {
				userUnionQuery += userUnionQuery != '' ?  ` UNION ${userCouponesRewardQuery}`: userCouponesRewardQuery;
			}
			
			if (request_type.includes('loyalty_points')) {
				userUnionQuery += userUnionQuery != '' ?  ` UNION ${userLoyaltyRewardQuery}`: userLoyaltyRewardQuery;
			}

			rewards = await models.sequelize.query(`SELECT * FROM (${userUnionQuery}) Rewards ORDER BY createdAt desc LIMIT ${offset}, ${limit}`,{
				type: models.sequelize.QueryTypes.SELECT
			});
			rewardsCounts = await models.sequelize.query(`SELECT * FROM (${userUnionQuery}) Rewards`,{
				type: models.sequelize.QueryTypes.SELECT
			})
			}
			const allRewardsData = await Promise.all([
				...rewards.map((rew) => {
					if (rew.type == 'gift_cards') {
						return new Promise(async (resolve) => {
						let gCard = {};
						if (user.role_id == 3) {
							gCard = await giftCardModel.findOne({
								include: [
									{
										model: userGiftCardList,
										attributes: ['id'],
										where: {
											payment_status: 1
										},
										required: false
									}
								],
								where:{
									id: rew.id
								},
								attributes: {
									include: [
										[models.sequelize.literal("'gift_cards'"),"type"],
									]
								},
							});
						} else {
							const userGiftCard = await userGiftCardList.findOne({
								where: {
									id: rew.user_giftcard_id,
								},
								include: [
									{
										model: giftCardModel
									}
								],
								raw: true,
								nest: true,
							})
							const userEmail = userGiftCard?.to_email;
							const userDetails =  await userModel.findOne({
								where: {
									email: userEmail,
									is_deleted: false,
									is_active: true
								}
							});
							if (userGiftCard.payment_status == 1) {
								const purchase_for = userGiftCard?.to_email ?  (userDetails?.email == userGiftCard?.to_email ? 'Self' : (userDetails?.username ? userDetails?.username : userGiftCard?.to_email) ) : 'Self';
								gCard['purchase_for'] = purchase_for;
								gCard['purchase_date'] = userGiftCard?.purchase_date || "";
								gCard['redeemed_amount'] = userGiftCard?.amount || "";
								if (userGiftCard?.from) {
									gCard['from'] = userGiftCard?.from || "";
									gCard['note'] = userGiftCard?.note || "";
								}
							}
							console.log('userGiftCard', rew.id, rew.user_giftcard_id);
							gCard = {...gCard ,...userGiftCard?.gift_card, id: rew.user_giftcard_id};
						}
						if (gCard) {
						gCard = JSON.parse(JSON.stringify(gCard));
							if(gCard?.image && gCard?.image != null){
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
							if (user.role_id == 3 ) {
								gCard.totalPurchase = gCard.user_giftcards.length  || 0; 
							}
							delete gCard.user_giftcards;
							// if (user.role_id == 2) {
							// 	const userGiftCard = await userGiftCardList.findOne({
							// 		where: {
							// 			gift_card_id: rew.id,
							// 			[Op.or] : [
							// 				{
							// 					[Op.and] : [
							// 						{ user_id: user.id },
							// 						{ to_email: null }
							// 					]
							// 				},
							// 				{
							// 					to_email: user?.user
							// 				}
							// 			],
							// 			is_deleted: false,
							// 			status: true,
							// 		}
							// 	})
							// 	//console.log('userGiftCard', rew.id, userGiftCard.to_email);
							// }
							let giftcardLoyalty = await loyaltyPointModel.findOne({
								where:{
									gift_card_id: {
										[Op.regexp]: `(^|,)${gCard.id}(,|$)`,
									},
									points_redeemed:true,
									//status:true,
									//isDeleted:false,
									//validity:{
									//	[Op.gte] : moment().format('YYYY-MM-DD')
									//},
								}
							})
							gCard['points_earned'] = giftcardLoyalty?.points_earned;
							gCard['points_redeemed'] = giftcardLoyalty?.amount;
							// responseArr.push(gCard);
								resolve(gCard);
							} else {
								resolve(null);
							}
						})
					} else if (rew.type == 'cashbacks') {
						return new Promise(async (resolve) => {
							let cashBackObj = await cashbackModel.findOne({
								where: {
									id: rew.id
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
							});
							if (cashBackObj) {
							cashBackObj = JSON.parse(JSON.stringify(cashBackObj));
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
								resolve(cashBackObj);
							} else {
								resolve(null);
							}
						})
					} else if (rew.type == 'discounts') {
						return new Promise(async (resolve) => {
							let discountObj = await discountModel.findOne({
								where:{
									id :rew.id
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
							});
							if (discountObj) {
							discountObj = JSON.parse(JSON.stringify(discountObj));
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
								resolve(discountObj);
							} else {
								resolve(null);
							}
						})
					} else if (rew.type == 'coupones') {
						return new Promise(async (resolve) => {
							let couponeObj = await couponeModel.findOne({
								where:{
									id: rew.id
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
							});
							if (couponeObj) {
							couponeObj = JSON.parse(JSON.stringify(couponeObj));
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
								resolve(couponeObj);
							} else {
								resolve(null);
							}
						})
					} else if (rew.type == 'loyalty_points') {
						return new Promise(async (resolve) => {
							let loyaltyObj = await loyaltyPointModel.findOne({
								where:{
									id: rew.id
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
											},
										],
									},
									{
										model: giftCardModel,
										attributes: ['id', 'name'],
									}
								],
							});
							if (loyaltyObj) {
							// loyaltyObj.dataValues.product_name = loyaltyObj?.dataValues?.product?.dataValues?.name || '';
							loyaltyObj.dataValues.product_category_name = loyaltyObj?.dataValues?.product?.dataValues?.product_categorys?.name || '';
							const products = await productModel.findAll({ where: { id: { [Op.in] : loyaltyObj?.dataValues?.product_id?.split(',') || [] } } ,attributes: ["name"]});
							const product_name_arr = products?.map(val => val.name);
							const product_name = product_name_arr?.length > 0 ? product_name_arr?.join(',') : '';
							loyaltyObj.dataValues.product_name = product_name;

							const giftCards = await giftCardModel.findAll({ where: { id: { [Op.in] : loyaltyObj?.dataValues?.gift_card_id?.split(',') || [] } } ,attributes: ["name"] });
							const giftcards_name_arr = giftCards?.map(val => val.name);
							const giftcard_name = giftcards_name_arr?.length > 0 ? giftcards_name_arr?.join(',') : '';
							loyaltyObj.dataValues.giftcard_name = giftcard_name;
							loyaltyObj.dataValues.expire_at = loyaltyObj.validity;
							// loyaltyObj.dataValues.giftcard_name = loyaltyObj?.dataValues?.gift_card?.name || '';
							delete loyaltyObj?.dataValues?.gift_card;
							delete loyaltyObj?.dataValues.product;
							if(loyaltyObj.validity < currentDate){
								loyaltyObj.is_expired = true;
							}else{
								loyaltyObj.is_expired = false;
							}
								resolve(loyaltyObj);
							} else {
								resolve(null);
							}
						})
					}
				})
			])
			const rewardList  = allRewardsData.filter(obj => obj != null);
			const response = new pagination(rewardList, rewardsCounts?.length || 0, parseInt(data.page), parseInt(limit) );
			res.send(setRes(resCode.OK, true, "Get rewards list successfully", ({ total_cashbacks , total_loyalty_points, total_rewards_purchase, total_loyalty_purchase, ...response.getPaginationInfo(), })));
		} else {
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}
	} catch (error) {
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