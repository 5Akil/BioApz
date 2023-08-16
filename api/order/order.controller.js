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
const Sequelize = require('sequelize');
var commonConfig = require('../../config/common_config');
var pagination = require('../../helpers/pagination');

exports.OrderHistory = async(req,res) => {

	var data = req.body;
	var orderModel = models.orders
	const orderDetailsModel = models.order_details
	var businessModel = models.business
	const productModel = models.products
	const categoryModel = models.product_categorys
	const userModel = models.user;
	var Op = models.Op
	const userEmail = req.userEmail;

	var requiredFields = _.reject(['page','page_size','order_type'], (o) => { return _.has(data, o)  })
	const user = await userModel.findOne({ where: {email : userEmail, is_deleted: false} });
	if(requiredFields == ""){
		if (user) {
			if(parseInt(data.page) < 0 || parseInt(data.page) === 0) {
				res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
			}
			var skip = data.page_size * (data.page - 1)
			var limit = parseInt(data.page_size)
			
			var condition = {
				offset:skip,
				limit : limit,
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
				subQuery:false,
				order: [
					['createdAt', 'DESC']
				],
				attributes: { exclude: ['is_deleted', 'updatedAt','delivery_status','payment_response','payment_status'] }
			}
			condition.where = {order_status:1,user_id:user.id,is_deleted: false}
			if(data.order_type == 0){
				condition.where = {order_status:{ [Op.in]: [2,3] },user_id:user.id,is_deleted: false}
			}
			
			const recordCount = await orderModel.findAndCountAll(condition);
			const totalRecords = recordCount?.count;

			await orderModel.findAll(condition).then(async OrderData => {
				for(const data of OrderData){

					data.dataValues.business_name = data.business.business_name

					if(data.business.banner != null){

						const signurl = await awsConfig.getSignUrl(data.business.banner).then(function(res){
							data.dataValues.image = res
						})
					}else{
						data.dataValues.image = commonConfig.default_image;
					}
					delete data.dataValues.business;
					data.dataValues.invoice_date = data.createdAt
					data.dataValues.invoice_no = data.order_no
				}
				const response = new pagination(OrderData, parseInt(totalRecords), parseInt(data.page), parseInt(data.page_size));
				res.send(setRes(resCode.OK,true,'Order history get successfully',(response.getPaginationInfo())))

			})
		} else {
			res.send(setRes(resCode.ResourceNotFound,false,'Authorized User not found',null))
		}
		
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.OrderDetail = async (req,res) => {

	var data = req.params
	const orderModel = models.orders;
	var orderDetailsModel = models.order_details
	var productModel = models.products
	var categoryModel = models.product_categorys
	const businessModel = models.business
	const userModel = models.user;
	const userEmail = req.userEmail;

	const user = await  userModel.findOne({  where: { email : userEmail, is_deleted: false } });
	var Op = models.Op

	if (user) {
		orderDetailsModel.findAll({
		  where: {
			order_id: data.id
		  },
		  include: [
			{
				model: orderModel,
				required:true,
				attributes: ['amount','createdAt','business_id','order_no',],
				include: [
					{
						model: businessModel,
						attributes: ['banner','business_name'] 
					}
				],
			},
			{
			  model: productModel,
			  required:true,
			  attributes: ['id','image','name','price','category_id','sub_category_id', 'product_item'],
			  include:  [{
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
		  attributes: { exclude: ['is_deleted', 'updatedAt','price','business_id','product_id'] }
		}).then(async orderDetails => {
			const orderdata = {
				amount: orderDetails[0]?.order?.amount || '',
				business_id: orderDetails[0]?.order?.business_id || '',
				invoice_date:  orderDetails[0]?.order?.createdAt || '',
				invoice_no:  orderDetails[0]?.order?.order_no || '',
				business_name:  orderDetails[0]?.order?.business?.business_name || '',
			}
			for (let data of orderDetails) {
				data.dataValues.category_name = data?.product?.product_categorys?.name
				data.dataValues.product_type = data?.product?.sub_category?.name
				data.dataValues.product_name = data?.product?.name
				data.dataValues.product_price = data?.product?.price
				data.product.dataValues.category_name = data?.product?.product_categorys?.name
				data.product.dataValues.product_type = data?.product?.sub_category?.name
				data.product.dataValues.product_image = ''
				if (data?.product?.image){
					const signurl = await awsConfig.getSignUrl(data.product.image[0]).then(function(res){
						data.product.dataValues.product_image = res
					})
				}else{
					data.dataValues.product_image = commonConfig.default_image
				}
				delete data?.product?.dataValues?.product_categorys
				delete data?.product?.dataValues?.sub_category
				// delete data?.dataValues?.product
				// delete data?.dataValues?.order
				
			}
			const products = [];
	
			orderDetails.forEach((order) => {
			  const product = order.product;
			  products.push(product);
			});
			
			orderdata['products'] = products;
			if (orderdata) {
				res.send(setRes(resCode.OK,true,'Get order details successfully',orderdata))
			} else {
				res.send(setRes(resCode.ResourceNotFound,false,'Order details not found',null))
			}
		}).catch(error => {	
			res.send(setRes(resCode.BadRequest,false,'Fail to get order details',null))
		})
	} else {
		res.send(setRes(resCode.ResourceNotFound,false,'Authorized User not found',null))
	}
}
 
exports.BusinessOrderHistory = async(req,res) => {

	var data = req.body;
	var orderModel = models.orders
	var userModel = models.user
	var businessModel = models.business
	const orderDetailsModel = models.order_details;
	const productModel = models.products;
	var Op = models.Op
	const userEmail = req.userEmail;

	var requiredFields = _.reject(['page','page_size','order_type'], (o) => { return _.has(data, o)  })
	if(requiredFields == ""){
		const searchText = data?.search ? data?.search.trim() : '';
		const searchCond = searchText !== '' ? { username: { [Op.like] : `%${searchText}%` } } : {}
		const business = await  businessModel.findOne({ where: { email : userEmail, is_deleted: false } });
		if (business) {
			if(parseInt(data.page) < 0 || parseInt(data.page) === 0) {
				res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
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
						model:businessModel,
						attributes : ['business_name']
					},
				],
				subQuery:false,
				order: [
					['createdAt', 'DESC']
				],
				attributes: { exclude: ['is_deleted', 'updatedAt','delivery_status','payment_response','payment_status'] }
			}
			condition.where = {order_status:1,business_id:business.id,is_deleted: false}
			if(data.order_type == 0){
				condition.where = {order_status:{ [Op.in]: [2,3] },business_id:business.id,is_deleted: false}
			}

			if(data.page_size != 0 && !_.isEmpty(data.page_size)){
				condition.offset = skip,
				condition.limit = limit
			}

			const recordCount = await orderModel.findAndCountAll(condition);
			const totalRecords = recordCount?.count;

			await orderModel.findAll(condition).then(async OrderData => {
				if(OrderData.length > 0){
					for(const data of OrderData){
						data.dataValues.user_name = data.user.username
						data.dataValues.business_name = data.business.business_name
						data.dataValues.invoice_date = data.createdAt
						data.dataValues.invoice_no = data.order_no
						if (data?.user?.profile_picture){
							await awsConfig.getSignUrl(data.user.profile_picture).then(async function(res){
								data.dataValues.image = res
							})
						}else{
							data.dataValues.image = commonConfig.default_user_image
						}
						delete data.dataValues.user
						delete data.dataValues.createdAt
						delete data.dataValues.order_no
						delete data.dataValues.business
					}
					const response = new pagination(OrderData, parseInt(totalRecords), parseInt(data.page), parseInt(data.page_size));
					res.send(setRes(resCode.OK,true,'Order history get successfully',(response.getPaginationInfo())))
				}else{
					res.send(setRes(resCode.ResourceNotFound,false,'Order history not found',null))
				}
			})
		} else {
			res.send(setRes(resCode.ResourceNotFound,false,'Authorized Business User not found',null))
		}
		
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.BusinessOrderDetail = async (req,res) => {

	var param = req.params
	var orderDetailsModel = models.order_details
	var productModel = models.products
	var categoryModel = models.product_categorys
	var userModel = models.user
	var Op = models.Op
	const businessModel = models.business
	const userEmail = req.userEmail;

	const business = await businessModel.findOne({ where: { email : userEmail, is_deleted: false } });
	if (business) {
		const availableOrder = await orderDetailsModel.findOne({where:{order_id:param.id}});
		if(!availableOrder){
			res.send(setRes(resCode.ResourceNotFound,true,'Order not found.',null))
		}else{
			await orderDetailsModel.findAll({
				where: {
				order_id: param.id
			  },
			  include: [
				{
				  model: productModel,
				  attributes: ['id','image','name','price','category_id','sub_category_id', 'product_item'],
				  include:  [{
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
		
				},
				{
					model: userModel,
					attributes: ['username','email','address','mobile','profile_picture']
				},
				{
					model: models.orders,
				},
			  ],
			}).then(async orderDetails => {
				var product_details = {};
				for(let data of orderDetails){
					data.dataValues.user_name = data.user.username
					data.dataValues.user_email = data.user.email
					data.dataValues.user_mobile = data.user.mobile
					data.dataValues.user_address = data.user.address
					const userImg = await awsConfig.getSignUrl(data.user.dataValues.profile_picture);
					if(userImg && userImg != null){
						data.dataValues.user_image = userImg;
					}else{
						data.dataValues.user_image = commonConfig.default_user_image;
					}
					delete data.dataValues.user
					data.product.dataValues.category_name = data?.product?.product_categorys?.name
					data.product.dataValues.product_type = data?.product?.sub_category?.name
					data.product.dataValues.qty = data.qty
					const signurl = await awsConfig.getSignUrl(data.product.image[0]).then(function(res){
						data.product.dataValues.product_image = res
					})

					delete data.product.dataValues.sub_category_id
					delete data.product.dataValues.image
					delete data.product.dataValues.product_categorys
					delete data.product.dataValues.sub_category
					delete data.dataValues.qty
					
				}
				const products = [];
		
				await orderDetails.forEach(async (order) => {
				  const product = order.product;
				  products.push(product);
				});
				const datas = {
					"user_id": orderDetails[0].user_id,
					"user_name" : orderDetails[0].user.username,
					"user_mobile" : orderDetails[0].user.mobile,
					"user_email" : orderDetails[0].user.email,
					"user_address" : orderDetails[0].user.address,
					"user_image" : orderDetails[0].dataValues.user_image,
					"order_id": orderDetails[0].order_id,
					"invoice_no": orderDetails[0].order?.order_no,
					"invoice_date": orderDetails[0].order?.createdAt,
					"amount": orderDetails[0].order?.amount,
					"order_status": orderDetails[0].order?.order_status,
					"createdAt": orderDetails[0].createdAt,
					"product" : products
				}
				orderDetails = datas
				res.send(setRes(resCode.OK,true,'Get order details successfully',orderDetails))
			}).catch(error => {
				console.log(error)
				res.send(setRes(resCode.InternalServer,false,'Internal server error.',null))
			})
		}
	} else {
		res.send(setRes(resCode.ResourceNotFound,false,'Authorized Business User not found',null))
	}
}

exports.transactionDetails = async (req, res) => {
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

        const requiredFields = _.reject(['order_id'], (o) => { return _.has(data, o) })
        if (requiredFields == "") {
            const condition = {
                include:[
                    {
                        model: orderDetailsModel,
                        attributes: ["product_id", "price", "qty", ],
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
						attributes: ["amount", "reference_reward_id", "reference_reward_type", "createdAt"],
						required: false,
						as: "rewards",
						where: {
							order_id: data.order_id,
							credit_debit: true,
						}
					},
                    {
                        model: businessModel,
                        attributes: ["business_name", "banner", "email"]
                    }
                ],
                attributes: ["id", "order_no", "amount", "payment_status", "order_status", "createdAt"],
                where: {
                    id: data.order_id,
                    user_id: user.id
                }
            }
            const orderDetail = await orderModel.findOne(condition);
            if (orderDetail) {
                for (let product of orderDetail.dataValues.order_details) {

                    // product type and categories
                    product.dataValues.product.dataValues.category_name = product?.dataValues?.product?.product_categorys?.name || ""
                    product.dataValues.product.dataValues.product_type = product?.dataValues?.product?.sub_category?.name || ""
                    delete product?.dataValues?.product?.dataValues?.product_categorys;
                    delete product?.dataValues?.product?.dataValues?.sub_category;
                    
                    // product images
                    product.dataValues.product.dataValues.product_images = [];
                    for (let img of product.dataValues.product.image) {
                        const signurl = await awsConfig.getSignUrl(img).then(function(res){
                            product.dataValues.product.dataValues.product_images.push(res);
                        });
                    }
                }
				// product rewards
				for (let reward of orderDetail.dataValues.rewards) {
					if (reward.reference_reward_type == "gift_cards") {
						const giftCardDetails = await userGiftCardsModel.findOne({
							include: [
								{
									model: giftCardsModel,
									attributes: ["image", "name", "description", "expire_at", "is_cashback" ]
								}
							],
							where: {
								id: reward.reference_reward_id
							},
							attributes: { exclude: ["payment_status","status","is_deleted","createdAt","updatedAt"] },
						});
						reward.dataValues.reward_details = giftCardDetails;
					}
					if (reward.reference_reward_type == "cashbacks") {
						const cashbackDetails = await cashbacksModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: { exclude: [ "status", "isDeleted", "createdAt", "updatedAt", "deleted_at" ] }
						});
						reward.dataValues.reward_details = cashbackDetails;
					}
					if (reward.reference_reward_type == "discounts") {
						const discoutDetails = await discountsModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: { exclude: [ "status", "isDeleted", "createdAt", "updatedAt", "deleted_at" ] }
						});
						reward.dataValues.reward_details = discoutDetails;
					}
					if (reward.reference_reward_type == "coupones") {
						const couponesDetails = await couponesModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: { exclude: [ "status", "isDeleted", "createdAt", "updatedAt", "deleted_at" ] }
						});
						reward.dataValues.reward_details = couponesDetails;
					}
					if (reward.reference_reward_type == "loyalty_points") {
						const loyaltyPointsDetails = await loyaltyPointsModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: { exclude: [ "status", "isDeleted", "createdAt", "updatedAt", "deleted_at" ] }
						});
						reward.dataValues.reward_details = loyaltyPointsDetails;
					}
				}
				const signurl = await awsConfig.getSignUrl(orderDetail?.dataValues?.business?.dataValues?.banner).then(function(res){
					orderDetail.dataValues.business.dataValues.banner = res;
				});
                return res.send(setRes(resCode.OK, false, "Transaction details for order", orderDetail))
            } else {
                return res.send(setRes(resCode.BadRequest, false, "Order not found", null))
            }
        } else {
            return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
        }

    } catch (error) {
        return res.send(setRes(resCode.BadRequest, false, "Something went wrong", "", null))
    }
}


exports.businessTransactionDetails = async (req, res) => {
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

        const requiredFields = _.reject(['order_id'], (o) => { return _.has(data, o) })
        if (requiredFields == "") {
            const condition = {
                include:[
                    {
                        model: orderDetailsModel,
                        attributes: ["product_id", "price", "qty", ],
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
						attributes: ["amount", "reference_reward_id", "reference_reward_type", "createdAt"],
						required: false,
						as: "rewards",
						where: {
							order_id: data.order_id,
							credit_debit: true,
						}
					},
                    {
                        model: userModel,
                        attributes: ["username", "profile_picture", "email"]
                    }
                ],
                attributes: ["id", "order_no", "amount", "payment_status", "order_status", "createdAt"],
                where: {
                    id: data.order_id,
                    business_id: user.id
                }
            }
            const orderDetail = await orderModel.findOne(condition);
			if (orderDetail) {
				for (let product of orderDetail.dataValues.order_details) {

                    // product type and categories
                    product.dataValues.product.dataValues.category_name = product?.dataValues?.product?.product_categorys?.name || ""
                    product.dataValues.product.dataValues.product_type = product?.dataValues?.product?.sub_category?.name || ""
                    delete product?.dataValues?.product?.dataValues?.product_categorys;
                    delete product?.dataValues?.product?.dataValues?.sub_category;
                    
                    // product images
                    product.dataValues.product.dataValues.product_images = [];
                    for (let img of product.dataValues.product.image) {
                        const signurl = await awsConfig.getSignUrl(img).then(function(res){
                            product.dataValues.product.dataValues.product_images.push(res);
                        });
                    }
                }
				// product rewards
				for (let reward of orderDetail.dataValues.rewards) {
					if (reward.reference_reward_type == "gift_cards") {
						const giftCardDetails = await userGiftCardsModel.findOne({
							include: [
								{
									model: giftCardsModel,
									attributes: ["image", "name", "description", "expire_at", "is_cashback" ]
								}
							],
							attributes: { exclude: ["payment_status","status","is_deleted","createdAt","updatedAt"] },
							where: {
								id: reward.reference_reward_id
							}
						});
						reward.dataValues.reward_details = giftCardDetails;
					}
					if (reward.reference_reward_type == "cashbacks") {
						const cashbackDetails = await cashbacksModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: { exclude: ["status","isDeleted","createdAt","updatedAt","deleted_at"] }
						});
						reward.dataValues.reward_details = cashbackDetails;
					}
					if (reward.reference_reward_type == "discounts") {
						const discoutDetails = await discountsModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: { exclude: ["status", "isDeleted", "createdAt", "updatedAt", "deleted_at"] }
						});
						reward.dataValues.reward_details = discoutDetails;
					}
					if (reward.reference_reward_type == "coupones") {
						const couponesDetails = await couponesModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: { exclude: [ "status", "isDeleted", "createdAt", "updatedAt", "deleted_at" ] }
						});
						reward.dataValues.reward_details = couponesDetails;
					}
					if (reward.reference_reward_type == "loyalty_points") {
						const loyaltyPointsDetails = await loyaltyPointsModel.findOne({
							where: {
								id: reward.reference_reward_id
							},
							attributes: { exclude: [ "status", "isDeleted", "createdAt", "updatedAt", "deleted_at" ] }
						});
						reward.dataValues.reward_details = loyaltyPointsDetails;
					}
				}
				const signurl = await awsConfig.getSignUrl(orderDetail?.dataValues?.user?.dataValues?.profile_picture).then(function(res){
					orderDetail.dataValues.user.dataValues.profile_picture = res;
				});
				return res.send(setRes(resCode.OK, false, "Transaction details for order", orderDetail))
			} else {
				return res.send(setRes(resCode.BadRequest, false, "Order not found", null))	
			}
        } else {
            return res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
        }

    } catch (error) {
        return res.send(setRes(resCode.BadRequest, false, "Something went wrong", "", null))
    }
}