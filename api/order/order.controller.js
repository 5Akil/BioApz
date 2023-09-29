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
var mailConfig = require('../../config/mail_config')
var awsConfig = require('../../config/aws_S3_config')
var util = require('util')
var notification = require('../../push_notification');
var commonConfig = require('../../config/common_config');
var pagination = require('../../helpers/pagination');
const {NOTIFICATION_TITLES,NOTIFICATION_TYPES,NOTIFICATION_MESSAGE} = require('../../config/notificationTypes');
const fcmNotification = require('../../push_notification')
const {JSON} = require('sequelize')

exports.OrderHistory = async (req,res) => {

	var data = req.body;
	var orderModel = models.orders
	const orderDetailsModel = models.order_details
	var businessModel = models.business
	const productModel = models.products
	const categoryModel = models.product_categorys
	const userModel = models.user;
	var Op = models.Op
	const reqUser = req?.user || {};
	const userEmail = reqUser?.user;

	var requiredFields = _.reject(['page','page_size','order_type'],(o) => {return _.has(data,o)})
	const user = await userModel.findOne({where: {id: reqUser.id,email: reqUser.user,is_deleted: false}});
	if(requiredFields == "") {
		if(user) {
			if(parseInt(data.page) < 0 || parseInt(data.page) === 0) {
				res.send(setRes(resCode.BadRequest,false,"invalid page number, should start with 1",null))
			}
			var skip = data.page_size * (data.page - 1)
			var limit = parseInt(data.page_size)

			var condition = {
				offset: skip,
				limit: limit,
				include: [
					{
						model: businessModel,
						attributes: ['banner','business_name']
					},
					{
						model: orderDetailsModel,
						required: true,
						include: [{
							model: productModel,
							include: [{
								model: categoryModel,
								as: 'product_categorys',
								where: {
									is_deleted: false,
									is_enable: true
								}
							}],
							attributes: []
						}],
						attributes: []
					}
				],
				subQuery: false,
				order: [
					['createdAt','DESC']
				],
				attributes: {exclude: ['is_deleted','updatedAt','delivery_status','payment_response','payment_status']}
			}
			condition.where = {order_status: 1,user_id: user.id,is_deleted: false}
			if(data.order_type == 0) {
				condition.where = {order_status: {[Op.in]: [2,3]},user_id: user.id,is_deleted: false}
			}

			const recordCount = await orderModel.findAndCountAll(condition);
			const totalRecords = recordCount?.count;

			await orderModel.findAll(condition).then(async OrderData => {
				for(const data of OrderData) {

					data.dataValues.business_name = data.business.business_name

					if(data.business.banner != null) {

						const signurl = await awsConfig.getSignUrl(data.business.banner).then(function(res) {
							data.dataValues.image = res
						})
					} else {
						data.dataValues.image = commonConfig.default_image;
					}
					delete data.dataValues.business;
					data.dataValues.invoice_date = data.createdAt
					data.dataValues.invoice_no = data.order_no
				}
				const response = new pagination(OrderData,parseInt(totalRecords),parseInt(data.page),parseInt(data.page_size));
				res.send(setRes(resCode.OK,true,'Order history get successfully',(response.getPaginationInfo())))

			})
		} else {
			res.send(setRes(resCode.ResourceNotFound,false,'Authorized User not found',null))
		}

	} else {
		res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
	}
}

exports.OrderDetail = async (req,res) => {

	var data = req.params
	const orderModel = models.orders;
	var orderDetailsModel = models.order_details
	var productModel = models.products
	var categoryModel = models.product_categorys
	const businessModel = models.business
	const rewardHistoryModel = models.reward_history;
	const userModel = models.user;
	const reqUser = req?.user || {};
	var couponModel = models.coupones;
	// const userEmail = req.userEmail;
	const userEmail = reqUser?.user;

	const user = await userModel.findOne({where: {email: userEmail,is_deleted: false}});
	var Op = models.Op

	if(user) {
		await orderDetailsModel.findAll({
			where: {
				order_id: data.id
			},
			include: [
				{
					model: orderModel,
					required: true,
					attributes: ['amount','createdAt','business_id','order_no',],
					include: [
						{
							model: businessModel,
							attributes: ['banner','business_name']
						},
						{
							model: rewardHistoryModel,
						}
					],
				},
				{
					model: productModel,
					required: true,
					attributes: ['id','image','name','price','category_id','sub_category_id','product_item'],
					include: [{
						model: categoryModel,
						as: 'product_categorys',
						attributes: ['name','id']
					},
					{
						model: categoryModel,
						as: 'sub_category',
						attributes: ['name','id']
					}
					]
				}
			],
			attributes: {exclude: ['is_deleted','updatedAt','price','business_id','product_id']}
		}).then(async orderDetails => {
			let businesssBanner = '';
			const bannerurl = await awsConfig.getSignUrl(orderDetails[0]?.order?.business?.banner).then(function(res) {
				businesssBanner = res
			})

			for(let data of orderDetails) {
				data.dataValues.category_name = data?.product?.product_categorys?.name
				data.dataValues.product_type = data?.product?.sub_category?.name
				data.dataValues.product_name = data?.product?.name
				data.dataValues.product_price = data?.product?.price
				data.product.dataValues.category_name = data?.product?.product_categorys?.name
				data.product.dataValues.product_type = data?.product?.sub_category?.name
				data.product.dataValues.product_image = ''
				if(data?.product?.image) {
					const signurl = await awsConfig.getSignUrl(data.product.image[0]).then(function(res) {
						data.product.dataValues.product_image = res
					})
				} else {
					data.dataValues.product_image = commonConfig.default_image
				}
				delete data?.product?.dataValues?.product_categorys
				delete data?.product?.dataValues?.sub_category
				// delete data?.dataValues?.product
				// delete data?.dataValues?.order

			}
			const products = [];

			for(const order of orderDetails) {
				const product = order.product;
				var isFree = false;

				var couponData = await couponModel.findOne({
					isDeleted: false,
					status: true,
					product_id: {
						[Op.regexp]: `(^|,)${product.id}(,|$)`,
					}
				});
				if(!(_.isNull(couponData))) {
					isFree = true;
				}
				product.dataValues.is_free = isFree
				products.push(product);
			}
			const totalCashbacks = await rewardHistoryModel.findAll({
				attributes: [
					[models.sequelize.fn('sum',models.sequelize.col('amount')),'total_cashbacks']
				],
				where: {
					order_id: data.id,
					reference_reward_type: 'cashbacks',
					credit_debit: true
				},
			});

			const totalDiscounts = await rewardHistoryModel.findAll({
				attributes: [
					[models.sequelize.fn('sum',models.sequelize.col('amount')),'total_discounts']
				],
				where: {
					order_id: data.id,
					reference_reward_type: 'discounts',
					credit_debit: true
				},
			});

			const totalLoyalty = await rewardHistoryModel.findAll({
				attributes: [
					[models.sequelize.fn('sum',models.sequelize.col('amount')),'total_loyalty']
				],
				where: {
					order_id: data.id,
					reference_reward_type: 'loyalty_points',
					credit_debit: true
				},
			});

			const totalUsedLoyalty = await rewardHistoryModel.findAll({
				attributes: [
					[models.sequelize.fn('sum',models.sequelize.col('amount')),'total_loyalty_used']
				],
				where: {
					order_id: data.id,
					reference_reward_type: 'loyalty_points',
					credit_debit: false
				},
			});

			const totalUsedCashbacks = await rewardHistoryModel.findAll({
				attributes: [
					[models.sequelize.fn('sum',models.sequelize.col('amount')),'total_used_cashbacks']
				],
				where: {
					order_id: data.id,
					reference_reward_type: 'cashbacks',
					credit_debit: false
				},
			});

			const onOrderCoupon = await rewardHistoryModel.findOne({
				where: {
					order_id: data.id,
					reference_reward_type: 'coupones',
					credit_debit: false
				},
			});
			var usedCoupon = null;
			if(!_.isNull(onOrderCoupon)) {
				usedCoupon = await couponModel.findOne({
					where: {
						isDeleted: false,
						status: true
					}
				})
			}

			const onOrderGiftCard = await rewardHistoryModel.findOne({
				where: {
					order_id: data.id,
					reference_reward_type: 'gift_cards',
					credit_debit: false
				},
			});
			var usedGiftCard = null;
			if(!_.isNull(onOrderGiftCard)) {
				var giftCardModel = models.gift_cards
				usedGiftCard = await giftCardModel.findOne({
					where: {
						isDeleted: false,
						status: true
					}
				})
			}

			const orderdata = {
				amount: orderDetails[0]?.order?.amount || '',
				business_id: orderDetails[0]?.order?.business_id || '',
				invoice_date: orderDetails[0]?.order?.createdAt || '',
				invoice_no: orderDetails[0]?.order?.order_no || '',
				business_name: orderDetails[0]?.order?.business?.business_name || '',
				banner_image: businesssBanner,
				total_cashbacks: totalCashbacks.length > 0 && (!_.isNull(totalCashbacks[0].dataValues.total_cashbacks)) ? totalCashbacks[0].dataValues.total_cashbacks : "0.00",
				total_discounts: totalDiscounts.length > 0 && (!_.isNull(totalDiscounts[0].dataValues.total_discounts)) ? totalDiscounts[0].dataValues.total_discounts : "0.00",
				total_loyalty: totalLoyalty.length > 0 && (!_.isNull(totalLoyalty[0].dataValues.total_loyalty)) ? totalLoyalty[0].dataValues.total_loyalty : "0.00",
				total_used_loyalty: totalUsedLoyalty.length > 0 && (!_.isNull(totalUsedLoyalty[0].dataValues.total_loyalty_used)) ? totalUsedLoyalty[0].dataValues.total_loyalty_used : "0.00",
				total_used_cashback: totalUsedCashbacks.length > 0 && (!_.isNull(totalUsedCashbacks[0].dataValues.total_used_cashbacks)) ? totalUsedCashbacks[0].dataValues.total_used_cashbacks : "0.00",
				used_coupon: usedCoupon,
				used_giftcard: usedGiftCard,
			}

			orderdata['products'] = products;

			if(orderdata) {
				res.send(setRes(resCode.OK,true,'Get order details successfully',orderdata))
			} else {
				res.send(setRes(resCode.ResourceNotFound,false,'Order details not found',null))
			}
		}).catch(error => {
			console.log(error)
			res.send(setRes(resCode.BadRequest,false,'Fail to get order details',null))
		})
	} else {
		res.send(setRes(resCode.ResourceNotFound,false,'Authorized User not found',null))
	}
}

exports.BusinessOrderHistory = async (req,res) => {

	var data = req.body;
	var orderModel = models.orders
	var userModel = models.user
	var businessModel = models.business
	const orderDetailsModel = models.order_details;
	const productModel = models.products;
	var Op = models.Op
	const user = req?.user;
	const userEmail = user?.user;

	var requiredFields = _.reject(['page','page_size','order_type'],(o) => {return _.has(data,o)})
	if(requiredFields == "") {
		const searchText = data?.search ? data?.search.trim() : '';
		const searchCond = searchText !== '' ? {username: {[Op.like]: `%${searchText}%`}} : {}
		const business = await businessModel.findOne({
			where: {id: user.id,email: user.user,is_deleted: false}
		});
		if(business) {
			if(parseInt(data.page) < 0 || parseInt(data.page) === 0) {
				res.send(setRes(resCode.BadRequest,false,"invalid page number, should start with 1",null))
			}
			var skip = data.page_size * (data.page - 1)
			var limit = parseInt(data.page_size)

			var condition = {
				include: [
					{
						model: userModel,
						attributes: ['username','profile_picture'],
						where: {
							...searchCond
						}
					},
					{
						model: businessModel,
						attributes: ['business_name']
					},
				],
				subQuery: false,
				order: [
					['createdAt','DESC']
				],
				attributes: {exclude: ['is_deleted','updatedAt','delivery_status','payment_response','payment_status']}
			}
			condition.where = {order_status: 1,business_id: business.id,is_deleted: false}
			if(data.order_type == 0) {
				condition.where = {order_status: {[Op.in]: [2,3]},business_id: business.id,is_deleted: false}
			}

			if(data.page_size != 0 && !_.isEmpty(data.page_size)) {
				condition.offset = skip,
					condition.limit = limit
			}

			const recordCount = await orderModel.findAndCountAll(condition);
			const totalRecords = recordCount?.count;

			await orderModel.findAll(condition).then(async OrderData => {
				for(const data of OrderData) {
					data.dataValues.user_name = data.user.username
					data.dataValues.business_name = data.business.business_name
					data.dataValues.invoice_date = data.createdAt
					data.dataValues.invoice_no = data.order_no
					if(data?.user?.profile_picture) {
						await awsConfig.getSignUrl(data.user.profile_picture).then(async function(res) {
							data.dataValues.image = res
						})
					} else {
						data.dataValues.image = commonConfig.default_user_image
					}
					delete data.dataValues.user
					delete data.dataValues.createdAt
					delete data.dataValues.order_no
					delete data.dataValues.business
				}
				const response = new pagination(OrderData,parseInt(totalRecords),parseInt(data.page),parseInt(data.page_size));
				res.send(setRes(resCode.OK,true,'Order history get successfully',(response.getPaginationInfo())))
			})
		} else {
			res.send(setRes(resCode.ResourceNotFound,false,'Authorized Business User not found',null))
		}

	} else {
		res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
	}
}

exports.BusinessOrderDetail = async (req,res) => {
	try {
		var param = req.params
		var orderDetailsModel = models.order_details
		var productModel = models.products
		var categoryModel = models.product_categorys
		var userModel = models.user
		var Op = models.Op
		const businessModel = models.business
		const rewardHistoryModel = models.reward_history;
		const user = req?.user || {};
		// const userEmail = req.userEmail;
		const userEmail = user?.user;
		var couponModel = models.coupones

		const business = await businessModel.findOne({where: {email: userEmail,is_deleted: false}});
		if(business) {
			const availableOrder = await orderDetailsModel.findOne({where: {order_id: param.id}});
			if(!availableOrder) {
				return res.send(setRes(resCode.ResourceNotFound,true,'Order not found.',null))
			} else {
				const orderDetails = await orderDetailsModel.findAll({
					where: {
						order_id: param.id
					},
					include: [
						{
							model: productModel,
							attributes: {exclude: ['createdAt','updatedAt']},
							include: [{
								model: categoryModel,
								as: 'product_categorys',
								attributes: ['name']
							},
							{
								model: categoryModel,
								as: 'sub_category',
								attributes: ['name']
							}
							],

						},
						{
							model: userModel,
							attributes: ['username','email','address','mobile','profile_picture']
						},
						{
							model: models.orders,
						},
					],
				});
				if(orderDetails) {
					var product_details = {};
					for(let data of orderDetails) {
						data.dataValues.user_name = data.user.username
						data.dataValues.user_email = data.user.email
						data.dataValues.user_mobile = data.user.mobile
						data.dataValues.user_address = data.user.address
						const userImg = await awsConfig.getSignUrl(data.user.dataValues.profile_picture);
						if(userImg && userImg != null) {
							data.dataValues.user_image = userImg;
						} else {
							data.dataValues.user_image = commonConfig.default_user_image;
						}
						delete data.dataValues.user
						data.product.dataValues.category_name = data?.product?.product_categorys?.name
						data.product.dataValues.product_type = data?.product?.sub_category?.name
						data.product.dataValues.qty = data.qty

						let product_images = data.product.image

						const image_array = [];
						if(product_images != null) {
							for(const data of product_images) {
								const signurl = await awsConfig.getSignUrl(data).then(function(res) {
									image_array.push(res);
								});
							}
						} else {
							image_array.push(commonConfig.default_image)
						}

						data.product.dataValues.product_images = image_array
						// const signurl = await awsConfig.getSignUrl(data.product.image[0]).then(function(res){
						// 	data.product.dataValues.product_image = res
						// })

						delete data.product.dataValues.sub_category_id
						// delete data.product.dataValues.image
						delete data.product.dataValues.product_categorys
						delete data.product.dataValues.sub_category
						delete data.dataValues.qty

					}
					const products = [];
					for(const order of orderDetails) {
						const product = order.product;
						var isFree = false;

						var couponData = await couponModel.findOne({
							isDeleted: false,
							status: true,
							product_id: {
								[Op.regexp]: `(^|,)${product.id}(,|$)`,
							}
						});
						if(!(_.isNull(couponData))) {
							isFree = true;
						}
						product.dataValues.is_free = isFree
						products.push(product);
					}

					const totalCashbacks = await rewardHistoryModel.findAll({
						attributes: [
							[models.sequelize.fn('sum',models.sequelize.col('amount')),'total_cashbacks']
						],
						where: {
							order_id: param.id,
							reference_reward_type: 'cashbacks',
							credit_debit: true
						},
					});

					const totalDiscounts = await rewardHistoryModel.findAll({
						attributes: [
							[models.sequelize.fn('sum',models.sequelize.col('amount')),'total_discounts']
						],
						where: {
							order_id: param.id,
							reference_reward_type: 'discounts',
							credit_debit: true
						},
					});

					const totalLoyalty = await rewardHistoryModel.findAll({
						attributes: [
							[models.sequelize.fn('sum',models.sequelize.col('amount')),'total_loyalty']
						],
						where: {
							order_id: param.id,
							reference_reward_type: 'loyalty_points',
							credit_debit: true
						},
					});

					const totalUsedLoyalty = await rewardHistoryModel.findAll({
						attributes: [
							[models.sequelize.fn('sum',models.sequelize.col('amount')),'total_loyalty_used']
						],
						where: {
							order_id: param.id,
							reference_reward_type: 'loyalty_points',
							credit_debit: false
						},
					});

					const totalUsedCashbacks = await rewardHistoryModel.findAll({
						attributes: [
							[models.sequelize.fn('sum',models.sequelize.col('amount')),'total_used_cashbacks']
						],
						where: {
							order_id: param.id,
							reference_reward_type: 'cashbacks',
							credit_debit: false
						},
					});

					const onOrderCoupon = await rewardHistoryModel.findOne({
						where: {
							order_id: param.id,
							reference_reward_type: 'coupones',
							credit_debit: false
						},
					});
					var usedCoupon = null;
					if(!_.isNull(onOrderCoupon)) {
						var couponModel = models.coupones;
						usedCoupon = await couponModel.findOne({
							where: {
								isDeleted: false,
								status: true
							}
						})
					}

					const onOrderGiftCard = await rewardHistoryModel.findOne({
						where: {
							order_id: param.id,
							reference_reward_type: 'gift_cards',
							credit_debit: false
						},
					});
					var usedGiftCard = null;
					if(!_.isNull(onOrderGiftCard)) {
						var giftCardModel = models.gift_cards
						usedGiftCard = await giftCardModel.findOne({
							where: {
								isDeleted: false,
								status: true
							}
						})
					}

					const datas = {
						"total_cashbacks": totalCashbacks.length > 0 && (!_.isNull(totalCashbacks[0].dataValues.total_cashbacks)) ? totalCashbacks[0].dataValues.total_cashbacks : "0.00",
						"total_discounts": totalDiscounts.length > 0 && (!_.isNull(totalDiscounts[0].dataValues.total_discounts)) ? totalDiscounts[0].dataValues.total_discounts : "0.00",
						"total_loyalty": totalLoyalty.length > 0 && (!_.isNull(totalLoyalty[0].dataValues.total_loyalty)) ? totalLoyalty[0].dataValues.total_loyalty : "0.00",
						"total_used_loyalty": totalUsedLoyalty.length > 0 && (!_.isNull(totalUsedLoyalty[0].dataValues.total_loyalty_used)) ? totalUsedLoyalty[0].dataValues.total_loyalty_used : "0.00",
						"total_used_cashback": totalUsedCashbacks.length > 0 && (!_.isNull(totalUsedCashbacks[0].dataValues.total_used_cashbacks)) ? totalUsedCashbacks[0].dataValues.total_used_cashbacks : "0.00",
						"used_coupon": usedCoupon,
						"used_giftcard": usedGiftCard,
						"user_id": orderDetails[0].user_id,
						"user_name": orderDetails[0].user.username,
						"user_mobile": orderDetails[0].user.mobile,
						"user_email": orderDetails[0].user.email,
						"user_address": orderDetails[0].user.address,
						"user_image": orderDetails[0].dataValues.user_image,
						"order_id": orderDetails[0].order_id,
						"invoice_no": orderDetails[0].order?.order_no,
						"invoice_date": orderDetails[0].order?.createdAt,
						"amount": orderDetails[0].order?.amount,
						"order_status": orderDetails[0].order?.order_status,
						"createdAt": orderDetails[0].createdAt,
						"product": products,
					}

					return res.send(setRes(resCode.OK,true,'Get order details successfully',datas))
				}


			}
		} else {
			return res.send(setRes(resCode.ResourceNotFound,false,'Authorized Business User not found',null))
		}
	} catch(error) {
		return res.send(
			setRes(resCode.BadRequest,false,error,null)
		);
	}
}

exports.transactionDetails = async (req,res) => {
	try {
		const data = req.body;

		const rewardHistoryModel = models.reward_history;
		const productModel = models.products;
		const orderModel = models.orders;
		const productCategoryModel = models.product_categorys;
		const orderDetailsModel = models.order_details
		const businessModel = models.business;

		const userGiftCardsModel = models.user_giftcards;
		const giftCardsModel = models.gift_cards;
		const discountsModel = models.discounts;
		const cashbacksModel = models.cashbacks;
		const couponesModel = models.coupones;
		const loyaltyPointsModel = models.loyalty_points;

		const user = req.user;

		const requiredFields = _.reject(['order_id'],(o) => {return _.has(data,o)})
		if(requiredFields == "") {
			const condition = {
				include: [
					{
						model: orderDetailsModel,
						attributes: ["product_id","price","qty",],
						include: [
							{
								model: productModel,
								attributes: ["name","description","image","product_item"],
								include: [
									{
										model: productCategoryModel,
										as: "product_categorys",
										attributes: ["name"]
									},
									{
										model: productCategoryModel,
										as: "sub_category",
										attributes: ["name"]
									},
								]
							},
						]
					},
					{
						model: rewardHistoryModel,
						attributes: ["amount","reference_reward_id","reference_reward_type","createdAt"],
						required: false,
						as: "rewards",
						where: {
							order_id: data.order_id,
							credit_debit: true,
						}
					},
					{
						model: businessModel,
						attributes: ["business_name","banner","email"]
					}
				],
				attributes: ["id","order_no","amount","payment_status","order_status","createdAt"],
				where: {
					id: data.order_id,
					user_id: user.id
				}
			}
			const orderDetail = await orderModel.findOne(condition);
			if(orderDetail) {
				for(let product of orderDetail.dataValues.order_details) {

					// product type and categories
					product.dataValues.product.dataValues.category_name = product?.dataValues?.product?.product_categorys?.name || ""
					product.dataValues.product.dataValues.product_type = product?.dataValues?.product?.sub_category?.name || ""
					delete product?.dataValues?.product?.dataValues?.product_categorys;
					delete product?.dataValues?.product?.dataValues?.sub_category;

					// product images
					product.dataValues.product.dataValues.product_images = [];
					for(let img of product.dataValues.product.image) {
						const signurl = await awsConfig.getSignUrl(img).then(function(res) {
							product.dataValues.product.dataValues.product_images.push(res);
						});
					}
				}
				// product rewards
				for(let reward of orderDetail.dataValues.rewards) {
					if(reward.reference_reward_type == "gift_cards") {
						const giftCardDetails = await userGiftCardsModel.findOne({
							include: [
								{
									model: giftCardsModel,
									attributes: ["image","name","description","expire_at","is_cashback"]
								}
							],
							where: {
								id: reward.reference_reward_id
							},
							attributes: {exclude: ["payment_status","status","is_deleted","createdAt","updatedAt"]},
						});
						reward.dataValues.reward_details = giftCardDetails;
					}
					if(reward.reference_reward_type == "cashbacks") {
						const cashbackDetails = await cashbacksModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: {exclude: ["status","isDeleted","createdAt","updatedAt","deleted_at"]}
						});
						reward.dataValues.reward_details = cashbackDetails;
					}
					if(reward.reference_reward_type == "discounts") {
						const discoutDetails = await discountsModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: {exclude: ["status","isDeleted","createdAt","updatedAt","deleted_at"]}
						});
						reward.dataValues.reward_details = discoutDetails;
					}
					if(reward.reference_reward_type == "coupones") {
						const couponesDetails = await couponesModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: {exclude: ["status","isDeleted","createdAt","updatedAt","deleted_at"]}
						});
						reward.dataValues.reward_details = couponesDetails;
					}
					if(reward.reference_reward_type == "loyalty_points") {
						const loyaltyPointsDetails = await loyaltyPointsModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: {exclude: ["status","isDeleted","createdAt","updatedAt","deleted_at"]}
						});
						reward.dataValues.reward_details = loyaltyPointsDetails;
					}
				}
				const signurl = await awsConfig.getSignUrl(orderDetail?.dataValues?.business?.dataValues?.banner).then(function(res) {
					orderDetail.dataValues.business.dataValues.banner = res;
				});
				return res.send(setRes(resCode.OK,false,"Transaction details for order",orderDetail))
			} else {
				return res.send(setRes(resCode.BadRequest,false,"Order not found",null))
			}
		} else {
			return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}

	} catch(error) {
		return res.send(setRes(resCode.BadRequest,false,"Something went wrong","",null))
	}
}


exports.businessTransactionDetails = async (req,res) => {
	try {
		const data = req.body;

		const rewardHistoryModel = models.reward_history;
		const productModel = models.products;
		const orderModel = models.orders;
		const productCategoryModel = models.product_categorys;
		const orderDetailsModel = models.order_details
		const userModel = models.user;

		const userGiftCardsModel = models.user_giftcards;
		const giftCardsModel = models.gift_cards;
		const discountsModel = models.discounts;
		const cashbacksModel = models.cashbacks;
		const couponesModel = models.coupones;
		const loyaltyPointsModel = models.loyalty_points;

		const user = req.user;

		const requiredFields = _.reject(['order_id'],(o) => {return _.has(data,o)})
		if(requiredFields == "") {
			const condition = {
				include: [
					{
						model: orderDetailsModel,
						attributes: ["product_id","price","qty",],
						include: [
							{
								model: productModel,
								attributes: ["name","description","image","product_item"],
								include: [
									{
										model: productCategoryModel,
										as: "product_categorys",
										attributes: ["name"]
									},
									{
										model: productCategoryModel,
										as: "sub_category",
										attributes: ["name"]
									},
								]
							},
						]
					},
					{
						model: rewardHistoryModel,
						attributes: ["amount","reference_reward_id","reference_reward_type","createdAt"],
						required: false,
						as: "rewards",
						where: {
							order_id: data.order_id,
							credit_debit: true,
						}
					},
					{
						model: userModel,
						attributes: ["username","profile_picture","email"]
					}
				],
				attributes: ["id","order_no","amount","payment_status","order_status","createdAt"],
				where: {
					id: data.order_id,
					business_id: user.id
				}
			}
			const orderDetail = await orderModel.findOne(condition);
			if(orderDetail) {
				for(let product of orderDetail.dataValues.order_details) {

					// product type and categories
					product.dataValues.product.dataValues.category_name = product?.dataValues?.product?.product_categorys?.name || ""
					product.dataValues.product.dataValues.product_type = product?.dataValues?.product?.sub_category?.name || ""
					delete product?.dataValues?.product?.dataValues?.product_categorys;
					delete product?.dataValues?.product?.dataValues?.sub_category;

					// product images
					product.dataValues.product.dataValues.product_images = [];
					for(let img of product.dataValues.product.image) {
						const signurl = await awsConfig.getSignUrl(img).then(function(res) {
							product.dataValues.product.dataValues.product_images.push(res);
						});
					}
				}
				// product rewards
				for(let reward of orderDetail.dataValues.rewards) {
					if(reward.reference_reward_type == "gift_cards") {
						const giftCardDetails = await userGiftCardsModel.findOne({
							include: [
								{
									model: giftCardsModel,
									attributes: ["image","name","description","expire_at","is_cashback"]
								}
							],
							attributes: {exclude: ["payment_status","status","is_deleted","createdAt","updatedAt"]},
							where: {
								id: reward.reference_reward_id
							}
						});
						reward.dataValues.reward_details = giftCardDetails;
					}
					if(reward.reference_reward_type == "cashbacks") {
						const cashbackDetails = await cashbacksModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: {exclude: ["status","isDeleted","createdAt","updatedAt","deleted_at"]}
						});
						reward.dataValues.reward_details = cashbackDetails;
					}
					if(reward.reference_reward_type == "discounts") {
						const discoutDetails = await discountsModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: {exclude: ["status","isDeleted","createdAt","updatedAt","deleted_at"]}
						});
						reward.dataValues.reward_details = discoutDetails;
					}
					if(reward.reference_reward_type == "coupones") {
						const couponesDetails = await couponesModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: {exclude: ["status","isDeleted","createdAt","updatedAt","deleted_at"]}
						});
						reward.dataValues.reward_details = couponesDetails;
					}
					if(reward.reference_reward_type == "loyalty_points") {
						const loyaltyPointsDetails = await loyaltyPointsModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: {exclude: ["status","isDeleted","createdAt","updatedAt","deleted_at"]}
						});
						reward.dataValues.reward_details = loyaltyPointsDetails;
					}
				}
				const signurl = await awsConfig.getSignUrl(orderDetail?.dataValues?.user?.dataValues?.profile_picture).then(function(res) {
					orderDetail.dataValues.user.dataValues.profile_picture = res;
				});
				return res.send(setRes(resCode.OK,false,"Transaction details for order",orderDetail))
			} else {
				return res.send(setRes(resCode.BadRequest,false,"Order not found",null))
			}
		} else {
			return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null))
		}

	} catch(error) {
		return res.send(setRes(resCode.BadRequest,false,"Something went wrong","",null))
	}
}

exports.orderCreate = async (req,res) => {
	const t = await models.sequelize.transaction();
	try {
		/** models and variables Declatrations */
		const data = req.body;
		const user = req?.user;
		const userModel = models.user;
		const businessModel = models.business;
		const orderModel = models.orders;
		const orderDetailsModel = models.order_details;
		const productModel = models.products;

		const notificationModel = models.notifications;
		const notificationReceiverModel = models.notification_receivers;
		const deviceModel = models.device_tokens;

		const rewardHistoryModel = models.reward_history;
		const userCouponModel = models.user_coupons;
		const userGiftCardsModel = models.user_giftcards;
		const giftCardsModel = models.gift_cards;
		const userEarnedRewardsModel = models.user_earned_rewards;

		const discountsModel = models.discounts;
		const cashbacksModel = models.cashbacks;
		const couponesModel = models.coupones;
		const loyaltyPointsModel = models.loyalty_points;

		/** Input Declatrations */
		const requiredFields = _.reject(["amount","payment_id","payment_status","payment_response"],(o) => {return _.has(data,o)});
		const blankField = _.reject(["amount","payment_id","payment_status"],(o) => {return data[o]});

		/** Validate inputs */
		if(data?.products?.length > 0) {
			let validProducts = true;
			let notBlankProductsField = true;
			let productArrayField = [];
			let blankProductsField = [];
			for(const product of data?.products) {
				productArrayField = _.reject(["product_id","category_id","price","qty"],(o) => {return _.has(product,o)});
				blankProductsField = _.reject(["product_id","category_id","price","qty"],(o) => {return product[o]});
				if(productArrayField != '') {
					validProducts = false;
					break;
				}
				if(blankProductsField != '') {
					notBlankProductsField = false;
					break;
				}
			}
			if(!validProducts) {
				return res.send(setRes(resCode.BadRequest,false,(productArrayField.toString() + ' are required for products'),null));
			}
			if(!notBlankProductsField) {
				return res.send(setRes(resCode.BadRequest,false,(blankProductsField.toString() + ' can not be blank'),null))
			}
		} else {
			return res.send(setRes(resCode.BadRequest,false,'Products are required',null));
		}

		if(requiredFields == "" && blankField != "") {
			return res.send(setRes(resCode.BadRequest,false,(blankField.toString() + ' can not be blank'),null))
		}

		if(requiredFields == "") {
			const businessDetails = await businessModel.findOne({where: {id: data.business_id}})

			/** Create Order and order details */
			const orderObj = {
				user_id: user.id,
				business_id: data.business_id,
				amount: data.amount,
				payment_id: data.payment_id,
				payment_status: data.payment_status,
				payment_response: data.payment_response && typeof (data.payment_response) != 'string' ? JSON.stringify(data.payment_response) : data.payment_response,
				delivery_status: 1, //pending
				order_status: 1, //pending
			}
			const createdOrder = await orderModel.create(orderObj,{transaction: t});
			const orderDetails = [];
			if(createdOrder.id) {
				for(const product of data.products) {
					console.log('product',product);
					const productDetails = await productModel.findOne({where: {id: product.product_id,business_id: data.business_id,is_deleted: false}});
					if(!productDetails) {
						throw new Error('Product details not found for business!');
					}
					const orderDetailObj = {
						user_id: user.id,
						order_id: createdOrder.id,
						business_id: data.business_id,
						product_id: product.product_id,
						category_id: product.category_id,
						price: product.price,
						qty: product.qty,
						order_status: 1, //1–Pending,2–Cancelled,3-Completed
					}
					orderDetails.push(orderDetailObj);
				}
			} else {
				throw new Error('Error while creating order!');
			}
			if(orderDetails.length > 0) {
				const createdOrderDetails = await orderDetailsModel.bulkCreate(orderDetails,{transaction: t});
			} else {
				throw new Error('Order details products missing!');
			}

			// validation on selected rewards 
			let loyaltyPointsUsed = false;
			let giftCardAndCashbackUsed = false;
			let couponCashbackDiscountUsed = false;

			if(data?.use_redeem_points?.is_used) {
				loyaltyPointsUsed = true;
			}

			if((data?.applied_giftcard?.user_gift_card_id && data?.use_cashback?.is_used)) {
				giftCardAndCashbackUsed = true;
			}

			if((data?.applied_coupon && data?.use_cashback?.is_used && data?.applied_discount)) {
				couponCashbackDiscountUsed = true;
			}

			if(loyaltyPointsUsed && (data?.applied_giftcard?.user_gift_card_id || data?.use_cashback?.is_used || data?.applied_coupon?.user_coupon_id || data?.applied_discount?.discount_id)) {
				throw new Error('Other rewards cannot be used with Redeem points.');
			}

			if(giftCardAndCashbackUsed && (loyaltyPointsUsed || data?.applied_coupon?.user_coupon_id || data?.applied_discount?.discount_id)) {
				throw new Error('Other rewards cannot be used with Giftcard and Redeem Cashback.');
			}

			if(couponCashbackDiscountUsed && data?.applied_giftcard?.user_gift_card_id) {
				throw new Error('Other rewards cannot be used with Coupon, Cashback and Discount.');
			}


			let sendUseCashbackNotification = false;
			/** Redeem/Use cashbacks by user */
			if(data?.use_cashback) {
				// Redeem cashback amount from user and create debit transaction
				if(data?.use_cashback?.amount && data?.use_cashback?.amount > 0 && data?.use_cashback?.is_used) {
					const rewardCashbackDebit = await rewardHistoryModel.create({
						order_id: createdOrder.id,
						credit_debit: false,
						amount: data?.use_cashback?.amount,
						reference_reward_type: 'cashbacks'
					},{transaction: t});
					const userWalletAmounts = await userModel.findOne({where: {id: user.id},attributes: ["total_loyalty_points","total_cashbacks"]});
					console.log('userWalletAmounts',userWalletAmounts);
					if(userWalletAmounts.total_cashbacks < data?.use_cashback?.amount) {
						throw new Error('Insufficient amount of cashback for user request');
					} else {
						const userCashbackUpdate = await userModel.update({
							total_cashbacks: models.sequelize.literal(`total_cashbacks - ${data?.use_cashback?.amount}`)
						},
							{
								where: {
									id: user.id
								}
							});
					}
				}
			}

			if(data?.use_redeem_points) {
				//Redeem loyalty points from user and create debit transaction
				if(data?.use_redeem_points?.amount && data?.use_redeem_points?.amount > 0 && data?.use_redeem_points?.is_used) {
					const rewardLoyaltyPointsDebit = await rewardHistoryModel.create({
						order_id: createdOrder.id,
						credit_debit: false,
						amount: data?.use_redeem_points?.amount,
						reference_reward_type: 'loyalty_points'
					},{transaction: t});
					const userWalletAmounts = await userModel.findOne({where: {id: user.id},attributes: ["total_loyalty_points","total_cashbacks"]});
					console.log('userWalletAmounts',userWalletAmounts);
					if(userWalletAmounts.total_loyalty_points < data?.use_redeem_points?.amount) {
						throw new Error('Insufficient amount of cashback for loyalty points request');
					} else {
						const userCashbackUpdate = await userModel.update({
							total_loyalty_points: models.sequelize.literal(`total_loyalty_points - ${data?.use_redeem_points?.amount}`)
						},
							{
								where: {
									id: user.id
								}
							},{transaction: t});
					}
				}
			}

			/** Update Required Rewards with created Order */
			// Coupon
			if(data?.applied_coupon?.user_coupon_id && data?.applied_coupon?.amount > 0) {
				// update used user coupon with order created
				const findAppliedCoupon = await userCouponModel.findOne({where: {id: data?.applied_coupon?.user_coupon_id,user_id: user.id}});
				if(findAppliedCoupon) {
					const updateCouponOrder = await userCouponModel.update({order_id: createdOrder.id},{where: {id: data?.applied_coupon?.user_coupon_id,user_id: user.id}},{transaction: t});
					const userCouponUsed = await rewardHistoryModel.create({
						order_id: createdOrder.id,
						credit_debit: true,
						amount: data?.applied_coupon?.amount,
						reference_reward_id: data?.applied_coupon?.user_coupon_id,
						reference_reward_type: 'coupones'
					},{transaction: t});
				}
			}

			// Giftcard
			if(data?.applied_giftcard) {
				// giftcard user coupon check if cashback then add user cashback reward "redeem_amount"
				const userGiftCardDetails = await userGiftCardsModel.findOne({
					where: {id: data?.applied_giftcard?.user_gift_card_id,user_id: user.id},
					attributes: {include: [[models.sequelize.literal('(user_giftcards.amount - user_giftcards.redeemed_amount)'),'remaining_amount']]},
					include: [{
						model: giftCardsModel,
						attributes: {exclude: ["status","isDeleted","createdAt","updatedAt","deleted_at"]}
					}]
				});
				const redeemAmount = data?.applied_giftcard?.redeem_amount;
				if(userGiftCardDetails?.id) {
					const usedAmountGiftCardReward = await rewardHistoryModel.create({
						order_id: createdOrder.id,
						credit_debit: false,
						amount: redeemAmount,
						reference_reward_id: userGiftCardDetails?.id,
						reference_reward_type: 'gift_cards'
					},{transaction: t});
					if(userGiftCardDetails?.gift_card?.is_cashback) {
						const cahsbackPercentage = userGiftCardDetails?.gift_card?.cashback_percentage;
						const cashbackAmount = Math.floor((redeemAmount * cahsbackPercentage) / 100);

						// If gift card has cashback true
						const cashbackReward = await rewardHistoryModel.create({
							order_id: createdOrder.id,
							credit_debit: true,
							amount: cashbackAmount,
							reference_reward_id: userGiftCardDetails?.id,
							reference_reward_type: 'cashbacks'
						},{transaction: t});

						/** Send Device notifications for event cancellation to all corresponding users.*/
						/** Send to user */


						const notificationUserObj = {
							role_id: user?.role_id,
							params: JSON.stringify({
								notification_type: NOTIFICATION_TYPES.CASHBACK_REWARD,
								title: NOTIFICATION_TITLES.CASHBACK_REWARD(),
								message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(createdOrder?.id,cashbackAmount),
								cashback_id: cashbackReward.id,
								user_id: orderObj?.user_id,
								business_id: orderObj?.business_id
							}),
							title: NOTIFICATION_TITLES?.CASHBACK_REWARD(),
							message: NOTIFICATION_MESSAGE?.CASHBACK_REWARD(createdOrder?.id,cashbackAmount),
							notification_type: NOTIFICATION_TYPES.CASHBACK_REWARD,
						}

						const notificationUser = await notificationModel.create(notificationUserObj);
						if(notificationUser && notificationUser.id) {
							const notificationReceiverUserObj = {
								role_id: orderObj?.user_id,
								notification_id: notificationUser.id,
								sender_id: orderObj?.business_id,
								receiver_id: orderObj?.user_id,
							}
							const notificationReceiver = await notificationReceiverModel.create(notificationReceiverUserObj);
						}
						/** FCM push noifiation */
						const activeUserReceiverDevices = await deviceModel.findOne({where: {status: 1,user_id: orderObj?.user_id}},{attributes: ["device_token"]});
						// const userDeviceTokensList = activeUserReceiverDevices.map((device) => device.device_token);
						// const userUniqueDeviceTokens = Array.from(new Set(userDeviceTokensList));
						const userNotificationPayload = {
							device_token: activeUserReceiverDevices?.device_token,
							title: NOTIFICATION_TITLES.CASHBACK_REWARD(),
							message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(createdOrder?.id,cashbackAmount),
							content: {notification_type: NOTIFICATION_TYPES?.CASHBACK_REWARD,notification_id: notificationUser?.id,title: NOTIFICATION_TITLES?.CASHBACK_REWARD(),message: NOTIFICATION_MESSAGE?.CASHBACK_REWARD(createdOrder?.id,cashbackAmount),cashback_id: cashbackReward?.id,user_id: orderObj?.user_id,business_id: orderObj?.business_id}
						};
						await fcmNotification.SendNotification(userNotificationPayload);
					}
				}
			}

			// Discount
			let sendDiscountNotification = false;
			if(data?.applied_discount && data?.applied_discount?.discount_id && data?.applied_discount?.amount) {
				const discountId = data?.applied_discount?.discount_id;
				const discountAmount = data?.applied_discount?.amount
				const discountReward = await rewardHistoryModel.create({
					order_id: createdOrder.id,
					credit_debit: true,
					amount: discountAmount,
					reference_reward_id: discountId,
					reference_reward_type: 'discounts'
				},{transaction: t});
				if(discountReward) {
					sendDiscountNotification = true;
				}
			}

			// calculateOrderAndProductLoyalty(data,createdOrder,user,businessDetails,t);


			// Old calculation where loyalty info was been received from frontend for calculation.
			// if (data?.applied_loyalty_points && data?.applied_loyalty_points?.loyalty_id) {
			// 	const loyaltyId = data?.applied_loyalty_points?.loyalty_id;
			// 	const loyaltyDetail = await loyaltyPointsModel.findOne({ where: { id: loyaltyId } });
			// 	let earnPoints;
			// 	if (loyaltyDetail?.id) {
			// 		if (loyaltyDetail.loyalty_type && !loyaltyDetail.points_redeemed) {
			// 			const loyaltySupportProducts = loyaltyDetail?.product_id?.split(',') || [];
			// 			const products = data?.products?.filter(product => loyaltySupportProducts.includes(product.product_id)) || [];
			// 			if (products.length > 0) {
			// 				earnPoints = loyaltyDetail.points_earned;
			// 			}
			// 		} else if (!loyaltyDetail.loyalty_type && !loyaltyDetail.points_redeemed){
			// 			if (+(data.amount) > loyaltyDetail.amount) {
			// 				earnPoints = loyaltyDetail.points_earned;
			// 			}
			// 		}
			// 		const loayaltyReward = await rewardHistoryModel.create({
			// 			order_id : createdOrder.id,
			// 			credit_debit: true,
			// 			amount: earnPoints,
			// 			reference_reward_id: loyaltyId,
			// 			reference_reward_type: 'loyalty_points'
			// 		}, { transaction: t });
			// 		if (loayaltyReward) {
			// 			sendLoyaltyNotification = true;
			// 		}
			// 	}
			// }

			// Cashback
			if(data?.applied_cashback && data?.applied_cashback?.cashback_id && data?.applied_cashback?.amount) {
				const discountId = data?.applied_cashback?.cashback_id;
				const cashbackReward = await rewardHistoryModel.create({
					order_id: createdOrder.id,
					credit_debit: true,
					amount: cashbackAmount,
					reference_reward_id: discountId,
					reference_reward_type: 'cashbacks'
				},{transaction: t});
			}

			// Update user wallet loyalty points and cashback


			// Earn Reward
			// if (data?.earn_reward) {
			// 	const rewardType = data?.earn_reward?.type;
			// 	const rewardId = data?.earn_reward?.reference_reward_id;
			// 	if (["coupones", "loyalty_points", "cashbacks", "discounts"].includes(rewardType)) {
			// 		let rewardDetail;
			// 		let rewardExpire;
			// 		if (rewardType == "coupones") {
			// 			rewardDetail = await couponesModel.findOne({ where: { id: rewardId } }); 
			// 			rewardExpire = rewardDetail.expire_at;
			// 		} else if (rewardType == "loyalty_points") {
			// 			rewardDetail = await loyaltyPointsModel.findOne({ where: { id: rewardId } }); 
			// 			rewardExpire = rewardDetail.validity;
			// 		} else if (rewardType == "cashbacks") {
			// 			rewardDetail = await cashbacksModel.findOne({ where: { id: rewardId } }); 
			// 			rewardExpire = rewardDetail.validity_for;
			// 		} else if (rewardType == "discounts") {
			// 			rewardDetail = await discountsModel.findOne({ where: { id: rewardId } });
			// 			rewardExpire = rewardDetail.validity_for;
			// 		}
			// 		if (rewardDetail) {
			// 			const userEarnedReward = await userEarnedRewardsModel.create({
			// 				user_id: user.id,
			// 				reference_reward_id: rewardId,
			// 				reference_reward_type: rewardType,
			// 				expiry_date: rewardExpire
			// 			},{ transaction: t });
			// 		}
			// 	}
			// }


			/** Send Device notifications order Placed*/
			/** Send to user */
			const notificationUserObj = {
				role_id: businessDetails.role_id,
				params: JSON.stringify({notification_type: NOTIFICATION_TYPES.PLACE_ORDER,title: NOTIFICATION_TITLES.PLACE_ORDER_USER(),message: NOTIFICATION_MESSAGE.PLACE_ORDER_USER(createdOrder?.order_no),order_id: createdOrder.id,user_id: user.id,business_id: businessDetails.id}),
				title: NOTIFICATION_TITLES.PLACE_ORDER_USER(),
				message: NOTIFICATION_MESSAGE.PLACE_ORDER_USER(createdOrder?.order_no),
				notification_type: NOTIFICATION_TYPES.PLACE_ORDER,
			}
			const notificationUser = await notificationModel.create(notificationUserObj,{transaction: t});
			if(notificationUser && notificationUser.id) {
				const notificationReceiverUserObj = {
					role_id: businessDetails.role_id,
					notification_id: notificationUser.id,
					sender_id: businessDetails.id,
					receiver_id: user.id,
				}
				const notificationReceiver = await notificationReceiverModel.create(notificationReceiverUserObj,{transaction: t});
			}
			/** FCM push noifiation */
			const activeUserReceiverDevices = await deviceModel.findAll({where: {status: 1,business_id: user.id}},{attributes: ["device_token"]});
			const userDeviceTokensList = activeUserReceiverDevices.map((device) => device.device_token);
			const userUniqueDeviceTokens = Array.from(new Set(userDeviceTokensList));
			const userNotificationPayload = {
				device_token: userUniqueDeviceTokens,
				title: NOTIFICATION_TITLES.PLACE_ORDER_USER(),
				message: NOTIFICATION_MESSAGE.PLACE_ORDER_USER(createdOrder?.order_no),
				content: {notification_type: NOTIFICATION_TYPES.PLACE_ORDER,notification_id: notificationUser?.id,title: NOTIFICATION_TITLES.PLACE_ORDER_USER(),message: NOTIFICATION_MESSAGE.PLACE_ORDER_USER(createdOrder?.order_no),order_id: createdOrder.id,user_id: user.id,business_id: businessDetails.id}
			};
			fcmNotification.SendNotification(userNotificationPayload);

			/** Send to Business */
			const notificationBusinessObj = {
				params: JSON.stringify({notification_type: NOTIFICATION_TYPES.PLACE_ORDER,title: NOTIFICATION_TITLES.PLACE_ORDER_BUSINESS(),message: NOTIFICATION_MESSAGE.PLACE_ORDER_BUSINESS(createdOrder?.order_no),order_id: createdOrder.id,user_id: user.id,business_id: businessDetails.id}),
				title: NOTIFICATION_TITLES.PLACE_ORDER_BUSINESS(),
				message: NOTIFICATION_MESSAGE.PLACE_ORDER_BUSINESS(createdOrder?.order_no),
				notification_type: NOTIFICATION_TYPES.PLACE_ORDER,
			}
			const notificationBusiness = await notificationModel.create(notificationBusinessObj,{transaction: t});
			if(notificationBusiness && notificationBusiness.id) {
				const notificationReceiverBusinessObj = {
					role_id: businessDetails.role_id,
					notification_id: notificationBusiness.id,
					receiver_id: businessDetails.id,
				}
				const notificationReceiver = await notificationReceiverModel.create(notificationReceiverBusinessObj,{transaction: t});
			}
			/** FCM push noifiation */
			const activeReceiverDevices = await deviceModel.findAll({where: {status: 1,business_id: businessDetails.id}},{attributes: ["device_token"]});
			const deviceTokensList = activeReceiverDevices.map((device) => device.device_token);
			const uniqueDeviceTokens = Array.from(new Set(deviceTokensList))
			const businessNotificationPayload = {
				device_token: uniqueDeviceTokens,
				title: NOTIFICATION_TITLES.PLACE_ORDER_BUSINESS(),
				message: NOTIFICATION_MESSAGE.PLACE_ORDER_BUSINESS(createdOrder?.order_no),
				content: {notification_type: NOTIFICATION_TYPES.PLACE_ORDER,notification_id: notificationBusiness?.id,title: NOTIFICATION_TITLES.PLACE_ORDER_BUSINESS(),message: NOTIFICATION_MESSAGE.PLACE_ORDER_BUSINESS(createdOrder?.order_no),order_id: createdOrder.id,user_id: user.id,business_id: businessDetails.id}
			};
			fcmNotification.SendNotification(businessNotificationPayload);


			/** Send User get discount Notifcation to Business User */
			if(sendDiscountNotification) {
				const notificationDiscountObj = {
					params: JSON.stringify({notification_type: NOTIFICATION_TYPES.DISCOUNT_USE,title: NOTIFICATION_TITLES.GET_DISCOUNT_ORDER(),message: NOTIFICATION_MESSAGE.GET_DISCOUNT_ORDER(createdOrder?.order_no),order_id: createdOrder.id,user_id: user.id,business_id: businessDetails.id}),
					title: NOTIFICATION_TITLES.GET_DISCOUNT_ORDER(),
					message: NOTIFICATION_MESSAGE.GET_DISCOUNT_ORDER(createdOrder?.order_no),
					notification_type: NOTIFICATION_TYPES.DISCOUNT_USE,
				}
				const notificationDiscount = await notificationModel.create(notificationDiscountObj,{transaction: t});
				if(notificationDiscount && notificationDiscount.id) {
					const notificationReceiverDiscountObj = {
						role_id: businessDetails.role_id,
						notification_id: notificationDiscount.id,
						receiver_id: businessDetails.id,
					}
					const notificationDiscountReceiver = await notificationReceiverModel.create(notificationReceiverDiscountObj,{transaction: t});
				}
				/** FCM push noifiation */
				const activeReceiverDevices = await deviceModel.findAll({where: {status: 1,business_id: businessDetails.id}},{attributes: ["device_token"]});
				const deviceTokensList = activeReceiverDevices.map((device) => device.device_token);
				const uniqueDeviceTokens = Array.from(new Set(deviceTokensList))
				const discountNotificationPayload = {
					device_token: uniqueDeviceTokens,
					title: NOTIFICATION_TITLES.GET_DISCOUNT_ORDER(),
					message: NOTIFICATION_MESSAGE.GET_DISCOUNT_ORDER(createdOrder?.order_no),
					content: {notification_type: NOTIFICATION_TYPES.DISCOUNT_USE,notification_id: notificationDiscount?.id,title: NOTIFICATION_TITLES.GET_DISCOUNT_ORDER(),message: NOTIFICATION_MESSAGE.GET_DISCOUNT_ORDER(createdOrder?.order_no),discount_id: data?.applied_discount?.discount_id,business_id: businessDetails.id}
				};
				fcmNotification.SendNotification(discountNotificationPayload);
			}

			calculateOrderAndProductLoyalty(data,createdOrder,user,businessDetails);
			calculateOrderAndProductCashback(data,createdOrder,user);
			t.commit();
			return res.send(setRes(resCode.OK,true,'Order Created Successfully!',null));
		} else {
			return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null));
		}
	} catch(error) {
		console.log(error);
		t.rollback();
		return res.send(setRes(resCode.BadRequest,false,error?.message || "Something went wrong","",null))
	}
}

/**
 * Order Products loyalty and Order Loyalty calculation on the given order.
 */
const calculateOrderAndProductLoyalty = async (data,createdOrder,user,businessDetails) => {
	const t = await models.sequelize.transaction();
	const userModel = models.user;
	const rewardHistoryModel = models.reward_history;
	const loyaltyPointsModel = models.loyalty_points;

	try {
		let businessProductLoyalties = await loyaltyPointsModel?.findAll({
			where: {
				loyalty_type: 1,
				status: 1,
				isDeleted: 0,
				business_id: data?.business_id,
				// [models.Op.and]: models.sequelize.literal(
				// 	productIds?.map(id => `FIND_IN_SET(${id}, product_id)`).join(' OR ')
				//   ),
				// [models.Op.and]:[models.sequelize.literal(`FIND_IN_SET(product_id, '${productIds.join()}')`)],
			}
		});

		const businessOrderLoyalties = await loyaltyPointsModel.findAll({
			where: {
				loyalty_type: 0,
				status: 1,
				isDeleted: 0,
				business_id: data?.business_id
			},
		})

		let loyaltyProducts = [];
		for(const product of data?.products) {
			for(const productLoyalty of businessProductLoyalties) {
				if(productLoyalty?.product_id?.split(',').includes(product?.product_id)) {
					loyaltyProducts?.push(productLoyalty);
				}
			}
		}



		if(loyaltyProducts?.length) {
			for await(const businessProductLoyalty of loyaltyProducts) {
				const loyaltyId = businessProductLoyalty?.id;
				let earnPoints = 0;
				if(businessProductLoyalty?.id) {
					if(businessProductLoyalty.loyalty_type && !businessProductLoyalty.points_redeemed) {
						earnPoints = businessProductLoyalty.points_earned;
					}
					const loyaltyReward = await rewardHistoryModel.create({
						order_id: createdOrder.id,
						credit_debit: true,
						amount: earnPoints,
						reference_reward_id: loyaltyId,
						reference_reward_type: 'loyalty_points'
					},{transaction: t});
					const userCashbackUpdate = await userModel.update({
						total_loyalty_points: models.sequelize.literal(`total_loyalty_points + ${businessProductLoyalty?.points_earned}`)
					},
						{
							where: {
								id: user.id
							}
						},{transaction: t});
					if(userCashbackUpdate) {
						await sendLoyaltyReceivedNotification(createdOrder,businessProductLoyalty,businessDetails,user,earnPoints,t)
					}
				}
			}
		}

		if(businessOrderLoyalties?.length) {
			for await(const businessOrderLoyalty of businessOrderLoyalties) {
				const loyaltyId = businessOrderLoyalty?.id;
				let earnPoints = 0;
				if(businessOrderLoyalty?.id) {
					if(!businessOrderLoyalty.loyalty_type && !businessOrderLoyalty.points_redeemed) {
						if(+(data.amount) >= businessOrderLoyalty.amount) {
							earnPoints = businessOrderLoyalty.points_earned;
							const loyaltyReward = await rewardHistoryModel.create({
								order_id: createdOrder.id,
								credit_debit: true,
								amount: earnPoints,
								reference_reward_id: loyaltyId,
								reference_reward_type: 'loyalty_points'
							},{transaction: t});
							const userCashbackUpdate = await userModel.update({
								total_loyalty_points: models.sequelize.literal(`total_loyalty_points + ${businessOrderLoyalty?.points_earned}`)
							},
								{
									where: {
										id: user.id
									}
								},{transaction: t});
							if(userCashbackUpdate) {
								await sendLoyaltyReceivedNotification(createdOrder,businessOrderLoyalty,businessDetails,user,earnPoints,t)
							}
						}
					}
				}
			}
		}
		t.commit();
	} catch(error) {
		t.rollback();
		console.error('Error occurred in loyalty calculation',error);
		throw error;
	}
}

/**
 * Order Products Cashback and Order Cashback calculation on the given order.
 */
const calculateOrderAndProductCashback = async (data,createdOrder,user) => {
	const t = await models.sequelize.transaction();
	const userModel = models.user;
	const rewardHistoryModel = models.reward_history;
	const cashbackModel = models.cashbacks;

	try {
		let productsCashback = await cashbackModel?.findAll({
			where: {
				cashback_on: 0,
				status: 1,
				isDeleted: 0,
				business_id: data?.business_id
			}
		});

		const OrderCashback = await cashbackModel.findAll({
			where: {
				cashback_on: 1,
				status: 1,
				isDeleted: 0,
				business_id: data?.business_id,
			},
		});

		// let cashbackProducts = [];
		//  for (const product of data?.products) {
		// 	for (const productCashback of productsCashback) {
		// 		if(productCashback?.product_id?.split(',').includes(product?.product_id)){
		// 			cashbackProducts?.push(productCashback);
		// 		}
		// 	}
		//  }

		for await(const product of data?.products) {
			for await(const cashback of productsCashback) {
				let cashbackAmount = 0;
				if(cashback?.product_id?.split(',')?.includes(product?.product_id)) {
					if(cashback.cashback_type) {
						cashbackAmount = cashback?.cashback_value;
					} else if(!cashback?.cashback_type) {
						cashbackAmount = (product?.price * cashback?.cashback_value) / 100;
					}
					const cashbackReward = await rewardHistoryModel.create({
						product_id: product.product_id,
						credit_debit: true,
						amount: cashbackAmount,
						reference_reward_id: cashback?.id,
						reference_reward_type: 'cashbacks'
					},{transaction: t});
					if(cashbackReward) {
						await sendCashbackReceivedNotification(user,createdOrder,cashbackReward,cashbackAmount);
					}

				}
			}
		}

		if(OrderCashback?.length) {
			for await(const cashback of OrderCashback) {
				cashbackAmount = 0;
				if(cashback?.cashback_type) {
					cashbackAmount = cashback?.cashback_value;
				} else if(!cashback?.cashback_type) {
					cashbackAmount = (data?.amount * cashback?.cashback_value) / 100;
				}
				const cashbackReward = await rewardHistoryModel.create({
					order_id: createdOrder?.id,
					credit_debit: true,
					amount: cashbackAmount,
					reference_reward_id: cashback?.id,
					reference_reward_type: 'cashbacks'
				},{transaction: t});
				if(cashbackReward) {
					await sendCashbackReceivedNotification(user,createdOrder,cashbackReward,cashbackAmount);
				}
			}
		}
		t.commit();
	} catch(error) {
		t.rollback();
		console.error('Error occurred in cashback calculation',error);
		throw error;
	}
}

/** Send User and Business Notifcation for Loyalty points*/
const sendLoyaltyReceivedNotification = async (createdOrder,loyalty,businessDetails,user,loyaltyPoints,t) => {

	const notificationModel = models.notifications;
	const notificationReceiverModel = models.notification_receivers;
	const deviceModel = models.device_tokens;
	try {

		// send to User
		const notificationLoyaltyUserObj = {
			role_id: businessDetails.role_id,
			params: JSON.stringify({notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER(),message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER(createdOrder?.order_no,loyaltyPoints),loyalty_id: loyalty?.id,business_id: businessDetails.id}),
			title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER(),
			message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER(createdOrder?.order_no,loyaltyPoints),
			notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
		}
		const notificationLoyaltyUser = await notificationModel.create(notificationLoyaltyUserObj);
		if(notificationLoyaltyUser && notificationLoyaltyUser.id) {
			const notificationReceiverLoyaltyObj = {
				role_id: user.role_id,
				notification_id: notificationLoyaltyUser.id,
				sender_id: businessDetails.id,
				receiver_id: user.id,
			}
			const notificationLoyaltyReceiver = await notificationReceiverModel.create(notificationReceiverLoyaltyObj,{transaction: t});
		}
		/** FCM push noifiation */
		const activeUserReceiverDevices = await deviceModel.findAll({where: {status: 1,user_id: user.id}},{attributes: ["device_token"]});
		const userDeviceTokensList = activeUserReceiverDevices.map((device) => device.device_token);
		const userUniqueDeviceTokens = Array.from(new Set(userDeviceTokensList))
		const userLoyaltyNotificationPayload = {
			device_token: userUniqueDeviceTokens,
			title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER(),
			message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER(createdOrder?.order_no,loyaltyPoints),
			content: {notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,notification_id: notificationLoyaltyUser?.id,title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_USER(),message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_USER(createdOrder?.order_no,loyaltyPoints),loyalty_id: loyalty?.id,business_id: businessDetails.id}
		};
		fcmNotification.SendNotification(userLoyaltyNotificationPayload);

		// send to Business
		// const notificationLoyaltyBusinessObj = {
		// 	params: JSON.stringify({ notification_type:NOTIFICATION_TYPES.LOYALTY_RECEIVED, title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_BUSINESS(),message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_BUSINESS(createdOrder?.order_no), loyalty_id: loyalty?.id, business_id: businessDetails.id }),
		// 	title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_BUSINESS(),
		// 	message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_BUSINESS(createdOrder?.order_no),
		// 	notification_type: NOTIFICATION_TYPES.LOYALTY_RECEIVED,
		// }
		// const notificationLoyaltyBusiness = await notificationModel.create(notificationLoyaltyBusinessObj);
		// if (notificationLoyaltyBusiness && notificationLoyaltyBusiness.id) {
		// 	const notificationReceiverDiscountObj = {
		// 		role_id : businessDetails.role_id,
		// 		notification_id : notificationLoyaltyBusiness.id, 
		// 		receiver_id: businessDetails.id,
		// 	}
		// 	const notificationLoyaltyReceiver = await notificationReceiverModel.create(notificationReceiverDiscountObj ,{ transaction: t });
		// }
		// /** FCM push noifiation */
		// const activeReceiverDevices = await deviceModel.findAll({ where: { status: 1, business_id: businessDetails.id } },{ attributes: ["device_token"] });
		// const deviceTokensList = activeReceiverDevices.map((device) => device.device_token);
		// const uniqueDeviceTokens = Array.from(new Set(deviceTokensList))
		// const discountNotificationPayload = {
		// 	device_token: uniqueDeviceTokens,
		// 	title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_BUSINESS(),
		// 	message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_BUSINESS(createdOrder?.order_no),
		// 	content: { notification_type:NOTIFICATION_TYPES.LOYALTY_RECEIVED, notification_id: notificationLoyaltyBusiness?.id, title: NOTIFICATION_TITLES.GET_LOYALTY_POINT_BUSINESS(),message: NOTIFICATION_MESSAGE.GET_LOYALTY_POINT_BUSINESS(createdOrder?.order_no), loyalty_id: loyalty?.id, business_id: businessDetails.id }
		// };
		// fcmNotification.SendNotification(discountNotificationPayload);
	} catch(error) {
		console.error('Error occurred in sending loyalty notification',error);
		throw error;
	}
}

/** Send User Notifcation for cashback rewards on product and orders*/
const sendCashbackReceivedNotification = async (user,createdOrder,cashbackReward,cashbackAmount) => {
	const notificationModel = models.notifications;
	const notificationReceiverModel = models.notification_receivers;
	const deviceModel = models.device_tokens;

	const notificationUserObj = {
		role_id: user?.role_id,
		params: JSON.stringify({
			notification_type: NOTIFICATION_TYPES.CASHBACK_REWARD,
			title: NOTIFICATION_TITLES.CASHBACK_REWARD(),
			message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(createdOrder?.order_no,cashbackAmount),
			cashback_id: cashbackReward.id,
			user_id: user?.id,
			business_id: createdOrder?.business_id
		}),
		title: NOTIFICATION_TITLES?.CASHBACK_REWARD(),
		message: NOTIFICATION_MESSAGE?.CASHBACK_REWARD(createdOrder?.order_no,cashbackAmount),
		notification_type: NOTIFICATION_TYPES.CASHBACK_REWARD,
	}

	const notificationUser = await notificationModel.create(notificationUserObj);
	if(notificationUser && notificationUser.id) {
		const notificationReceiverUserObj = {
			role_id: user?.id,
			notification_id: notificationUser.id,
			sender_id: createdOrder?.business_id,
			receiver_id: user?.id,
		}
		const notificationReceiver = await notificationReceiverModel.create(notificationReceiverUserObj);
	}
	/** FCM push noifiation */
	const activeUserReceiverDevices = await deviceModel.findOne({where: {status: 1,user_id: user?.id}},{attributes: ["device_token"]});
	const userNotificationPayload = {
		device_token: activeUserReceiverDevices?.device_token,
		title: NOTIFICATION_TITLES.CASHBACK_REWARD(),
		message: NOTIFICATION_MESSAGE.CASHBACK_REWARD(createdOrder?.order_no,cashbackAmount),
		content: {notification_type: NOTIFICATION_TYPES?.CASHBACK_REWARD,notification_id: notificationUser?.id,title: NOTIFICATION_TITLES?.CASHBACK_REWARD(),message: NOTIFICATION_MESSAGE?.CASHBACK_REWARD(createdOrder?.order_no,cashbackAmount),cashback_id: cashbackReward?.id,user_id: user?.id,business_id: createdOrder?.business_id}
	};
	await fcmNotification.SendNotification(userNotificationPayload);
}


exports.updateOrderStatus = async (req,res) => {
	const t = await models.sequelize.transaction();
	try {
		const data = req.body;
		const Op = models.Op;
		const orderModel = models.orders;
		const userModel = models.user;

		const notificationModel = models.notifications;
		const notificationReceiverModel = models.notification_receivers;
		const deviceModel = models.device_tokens;
		const rewardHistoryModel = models.reward_history;

		const businessUser = req?.user;

		// To update user's wallet values store 
		let user_loyalty = 0,user_cashback = 0;

		const requiredFields = _.reject(["order_status","order_id"],(o) => {return _.has(data,o)});
		if([2,3].includes(data.order_status)) {
			return res.send(setRes(resCode.BadRequest,false,'provide valid Order status',null));
		}
		if(requiredFields == '') {
			const orderDetails = await orderModel.findOne({where: {id: data.order_id}});
			const userDetails = await userModel.findOne({where: {id: orderDetails.user_id}})

			const updateOrder = await orderModel.update({order_status: data.order_status},{where: {id: data.order_id}},{transaction: t})
			if(data.order_status == 3) {
				const userWalletAmounts = await userModel.findOne({where: {id: orderDetails.user_id},attributes: ["total_loyalty_points","total_cashbacks"]});
				const rewardsAdded = await rewardHistoryModel.findAll({
					where: {
						order_id: data.order_id,
						reference_reward_type: {[Op.in]: ['loyalty_points','cashbacks']},
						credit_debit: true,
					}
				});

				if(rewardsAdded?.length > 0) {
					for(const reward of rewardsAdded) {
						if(reward.reference_reward_type == 'loyalty_points') {
							user_loyalty += +(reward.amount) || 0;
						}
						if(reward.reference_reward_type == 'cashbacks') {
							user_cashback += +(reward.amount) || 0;
						}
					}
				}

				const userCashbackLoyaltyPointUpdate = await userModel.update({
					total_loyalty_points: models.sequelize.literal(`total_loyalty_points + ${user_loyalty}`),
					total_cashbacks: models.sequelize.literal(`total_cashbacks + ${user_cashback}`)
				},
					{
						where: {
							id: orderDetails.user_id
						}
					},{transaction: t});

				/** Send Device notifications order Placed*/
				/** Send to user */
				const notificationUserObj = {
					role_id: businessUser.role_id,
					params: JSON.stringify({notification_type: NOTIFICATION_TYPES.ORDER_DELIVERED,title: NOTIFICATION_TITLES.ORDER_DELIVERED_USER(),message: NOTIFICATION_MESSAGE.ORDER_DELIVERED_USER(orderDetails?.order_no),order_id: orderDetails.id,user_id: orderDetails.user_id,business_id: businessUser.id}),
					title: NOTIFICATION_TITLES.ORDER_DELIVERED_USER(),
					message: NOTIFICATION_MESSAGE.ORDER_DELIVERED_USER(orderDetails?.order_no),
					notification_type: NOTIFICATION_TYPES.ORDER_DELIVERED,
				}
				const notificationUser = await notificationModel.create(notificationUserObj);
				if(notificationUser && notificationUser.id) {
					const notificationReceiverUserObj = {
						role_id: userDetails.role_id,
						notification_id: notificationUser.id,
						sender_id: businessUser.id,
						receiver_id: userDetails.id,
					}
					const notificationReceiver = await notificationReceiverModel.create(notificationReceiverUserObj);
				}
				/** FCM push noifiation */
				const activeUserReceiverDevices = await deviceModel.findAll({where: {status: 1,user_id: orderDetails.user_id}},{attributes: ["device_token"]});
				const userDeviceTokensList = activeUserReceiverDevices.map((device) => device.device_token);
				const userUniqueDeviceTokens = Array.from(new Set(userDeviceTokensList));
				const userNotificationPayload = {
					device_token: userUniqueDeviceTokens,
					title: NOTIFICATION_TITLES.ORDER_DELIVERED_USER(),
					message: NOTIFICATION_MESSAGE.ORDER_DELIVERED_USER(orderDetails?.order_no),
					content: {notification_type: NOTIFICATION_TYPES.ORDER_DELIVERED,notification_id: notificationUser?.id,title: NOTIFICATION_TITLES.ORDER_DELIVERED_USER(),message: NOTIFICATION_MESSAGE.ORDER_DELIVERED_USER(orderDetails?.order_no),order_id: orderDetails.id,user_id: orderDetails.user_id,business_id: businessUser.id}
				};
				fcmNotification.SendNotification(userNotificationPayload);

				/** Send to Business */
				const notificationBusinessObj = {
					params: JSON.stringify({notification_type: NOTIFICATION_TYPES.ORDER_DELIVERED,title: NOTIFICATION_TITLES.ORDER_DELIVERED_BUSINESS(),message: NOTIFICATION_MESSAGE.ORDER_DELIVERED_BUSINESS(orderDetails?.order_no),order_id: orderDetails.id,user_id: orderDetails.user_id,business_id: businessUser.id}),
					title: NOTIFICATION_TITLES.ORDER_DELIVERED_BUSINESS(),
					message: NOTIFICATION_MESSAGE.ORDER_DELIVERED_BUSINESS(orderDetails?.order_no),
					notification_type: NOTIFICATION_TYPES.ORDER_DELIVERED,
				}
				const notificationBusiness = await notificationModel.create(notificationBusinessObj);
				if(notificationBusiness && notificationBusiness.id) {
					const notificationReceiverBusinessObj = {
						role_id: businessUser.role_id,
						notification_id: notificationBusiness.id,
						receiver_id: businessUser.id,
					}
					const notificationReceiver = await notificationReceiverModel.create(notificationReceiverBusinessObj);
				}
				/** FCM push noifiation */
				const activeReceiverDevices = await deviceModel.findAll({where: {status: 1,business_id: businessUser.id}},{attributes: ["device_token"]});
				const deviceTokensList = activeReceiverDevices.map((device) => device.device_token);
				const uniqueDeviceTokens = Array.from(new Set(deviceTokensList))
				const businessNotificationPayload = {
					device_token: uniqueDeviceTokens,
					title: NOTIFICATION_TITLES.ORDER_DELIVERED_BUSINESS(),
					message: NOTIFICATION_MESSAGE.ORDER_DELIVERED_BUSINESS(orderDetails?.order_no),
					content: {notification_type: NOTIFICATION_TYPES.ORDER_DELIVERED,notification_id: notificationBusiness?.id,title: NOTIFICATION_TITLES.ORDER_DELIVERED_BUSINESS(),message: NOTIFICATION_MESSAGE.ORDER_DELIVERED_BUSINESS(orderDetails?.order_no),order_id: orderDetails.id,user_id: orderDetails.user_id,business_id: businessUser.id}
				};
				fcmNotification.SendNotification(businessNotificationPayload);
			}
			t.commit();
			return res.send(setRes(resCode.OK,true,'Order status updated.',{order_id: data.order_id}));
		} else {
			return res.send(setRes(resCode.BadRequest,false,(requiredFields.toString() + ' are required'),null));
		}
	} catch(error) {
		t.rollback();
		return res.send(setRes(resCode.BadRequest,false,"Something went wrong","",null))
	}
}