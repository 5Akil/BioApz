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
var commonConfig = require('../../config/common_config')
const { model } = require('mongoose')
const pagination = require('../../helpers/pagination');

exports.AddToWishList = async(req, res) =>{

	var data = req.body
	var wishlistModel = models.wishlists
	var userModel = models.user
	var productModel = models.products

	var requiredFields = _.reject(['user_id', 'product_id','price'], (o) => { return _.has(data, o)  })

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
						wishlistModel.findOne({where: {user_id: data.user_id,product_id : data.product_id, is_deleted: false}}).then(product => {
							if(product == null){
				
								wishlistModel.create(data).then(function (wishlistData) {
									if (wishlistData) {
										res.send(setRes(resCode.OK, true, 'Product added into wishlist successfully.',wishlistData));
									} else {
										res.send(setRes(resCode.BadRequest, false, 'Fail to add into wishlist',null));
									}
								});
								
							}else{
				
								res.send(setRes(resCode.BadRequest, false, 'Product already into a wishlist...',null));
							}
						})
					}
				})
			}
		})
		
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.wishlistData = async (req, res) => {

	var data = req.params
	var query = req.body
	var wishlistModel = models.wishlists
	var productCategoryModel = models.product_categorys
	var productModel = models.products
	var shoppingCartModel = models.shopping_cart
	var userModel = models.user
	var Op = models.Op;
	var validation = true;
	var authUser = req.user;

	var requiredFields = _.reject(['page','page_size'], (o) => { return _.has(query, o)  })

	if (requiredFields == ''){
		
		if(query.page < 0 || query.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}
		var skip = query.page_size * (query.page - 1)
		var limit = parseInt(query.page_size)

		var userData = await userModel.findOne({where:{id:authUser.id,
			role_id:{
				[Op.ne]:3
			},
			is_deleted:false}});
		if(!userData){
			validation = false;
			return res.send(setRes(resCode.ResourceNotFound, false, "User not found.",null))
		}


		var conditonFilter = {
			is_deleted:false
		}
		if(query.search && query.search != null && !_.isEmpty(query.search)){
			conditonFilter = {...conditonFilter, ...{[Op.or]: [{name: {[Op.like]: "%" + query.search + "%",}}],}}
		} 
		
		var condition = {
			include: [
				{
					model: productModel,
					where: conditonFilter,
					// where:{[Op.or]: [{name: {[Op.like]: "%" + query.search + "%",}}],},
					include:[
						{
							model: productCategoryModel,
							as: 'product_categorys',
							attributes:['name'],
							
						},
						{
							model: productCategoryModel,
							as: 'sub_category',
							attributes:['name']
						}
					]
				}
			],
		}

		if(data.page_size != 0 && !_.isEmpty(data.page_size)){
			condition.offset = skip,
			condition.limit = limit
		}
		condition.where = {
			user_id: authUser.id,
			is_deleted: false
		}

		if(query.page_size != 0 && !_.isEmpty(query.page_size)){
			condition.offset = skip,
			condition.limit = limit
		}

		condition.attributes = {exclude: ['createdAt','updatedAt','is_deleted']}
		const recordCount = await wishlistModel.findAndCountAll(condition);
		const totalRecords = recordCount?.count;
		if(validation){
			await wishlistModel.findAll(condition).then(async wishlistData => {
	
				if(wishlistData != null && wishlistData != ""){
		
					for(var data of wishlistData){
						var isAddCart = false;
						if(data.product != null){
							await shoppingCartModel.findAll({
								where: {
									user_id:authUser.id,
									product_id: data.product.id,
									is_deleted: false
								},}).then(async addcart => {
									if(addcart.length > 0){
										isAddCart = true;
									}
							});

							

							if(data.product != null){
								var rewards = [];
								const cashbaksModel = models.cashbacks;
								var discountsModel = models.discounts;
								const loyaltyPointModel = models.loyalty_points;
								var couponModel = models.coupones
								var Op = models.Op;
								const discounts = await discountsModel.findAll({
									attributes: {exclude:['createdAt','updatedAt', 'deleted_at', 'isDeleted']},
									where: {
										product_id: {
											[Op.regexp]: `(^|,)${data.product.id}(,|$)`,
										},
										status: true,
										isDeleted: false
									}
								});
								for (const data of discounts) {
									let discountString = ''
									if (data.discount_type == 0) {
										discountString += `${data.discount_value}% Discount`
									} else {
										discountString += `$${data.discount_value} Discount`
									}
									rewards.push({type: 'discounts',title: discountString,business_id:data.business_id,discount_type:data.discount_type,discount_value:data.discount_value,product_category_id:data.product_category_id,product_id:data.product_id,validity_for:data.validity_for,status:data.status,
									});
								}
		
								const coupones = await couponModel.findAll({
									attributes: ['id','value_type', 'coupon_value', 'coupon_type'],
									where: {
										product_id: {
											[Op.regexp]: `(^|,)${data.product.id}(,|$)`,
										},
										status: true,
										isDeleted: false
									}
								});
								for (const data of coupones) {
									let couponString = ''
									if (data.coupon_type == 1) {
										if (data.value_type == 1) {
											couponString += `${data.coupon_value}% Discount`
										} else {
											couponString += `$${data.coupon_value} Discount`
										}
										rewards.push({ type: 'coupones', title: couponString});
									}
								}
		
								const cashbacks = await cashbaksModel.findAll({
									attributes: ['id','cashback_value', 'cashback_type', 'cashback_on'],
									where: {
										product_id: {
											[Op.regexp]: `(^|,)${data.product.id}(,|$)`,
										},
										status: true,
										isDeleted: false
									}
								});
								for (const data of cashbacks) {
									let discountString = '';
									if (data.cashback_on == 0) {
										if (data.cashback_type == 0) {
											discountString += `${data.cashback_value}% cashback`;
										} else {
											discountString += `$${data.cashback_value} cashback`;
										}
										rewards.push({ type: 'cashback', title: discountString});
									}
								}
		
								const loyaltyPoints = await loyaltyPointModel.findAll({
									attributes: ['id','loyalty_type', 'points_earned'],
									where: {
										product_id: {
											[Op.regexp]: `(^|,)${data.product.id}(,|$)`,
										},
										status: true,
										isDeleted: false
									}
								});
								for (const data of loyaltyPoints) {
									let loyaltyString = '';
									if (data.loyalty_type == 1) {
										loyaltyString += `Earn ${data.points_earned} points`
										rewards.push({ type: 'loyalty_points', title: loyaltyString});
									}
								}
								if(data.product.image != null && !_.isEmpty(data.product.image)){
									var product_image = await awsConfig.getSignUrl(data.product.image[0]).then(function(res){
										data.dataValues.product_image = res;
									})
								}else{
									data.dataValues.product_image = commonConfig.default_image
								}
								
								if(data.product != null){
									data.dataValues.business_id = data.product.business_id;
								}else{
									data.dataValues.business_id = null;
								}
		
								if(data.product != null){
									data.dataValues.product_name = data.product.name;
								}else{
									data.dataValues.product_name = null;
								}
								
								if(data.product.product_categorys != null){
									data.dataValues.category_name = data.product.product_categorys.name;
								}else{
									data.dataValues.category_name = null;
								}
								if(data.product.sub_category != null){
									data.dataValues.sub_category_name = data.product.sub_category.name;
								}else{
									data.dataValues.sub_category_name = null;
								}
								
								if(data.product.description != null){
				
									data.dataValues.description = data.product.description
								}else{
									data.dataValues.description = null
								}
				
								if(data.product != null){
									data.dataValues.rating = null
								}else{
									data.dataValues.rating = null
								}
								data.dataValues.rewards = rewards;
							}
						}
						
		
						if(data.product.image != null && !_.isEmpty(data.product.image)){
							var product_image = await awsConfig.getSignUrl(data.product.image[0]).then(function(res){
								data.dataValues.product_image = res;
							})
						}else{
							data.dataValues.product_image = commonConfig.default_image
						}
						if(data.product != null){
							data.dataValues.product_name = data.product.name;
						}else{
							data.dataValues.product_name = null;
						}
						if(data.product != null){
							data.dataValues.business_id = data.product.business_id;
						}else{
							data.dataValues.business_id = null;
						}
		
						if(data.product.product_categorys != null){
							data.dataValues.category_name = data.product.product_categorys.name;
						}else{
							data.dataValues.category_name = null;
						}
						if(data.product.sub_category != null){
							data.dataValues.sub_category_name = data.product.sub_category.name;
						}else{
							data.dataValues.sub_category_name = null;
						}
						
						if(data.product.description != null){
		
							data.dataValues.description = data.product.description
						}else{
							data.dataValues.description = null
						}
		
						if(data.product != null){
		
							data.dataValues.rating = null
						}else{
							data.dataValues.rating = null
						}
						
						data.dataValues.is_added_cart = isAddCart
		
						delete data.dataValues.category_id
						delete data.dataValues.product
					}
					const response = new pagination(wishlistData, parseInt(totalRecords), parseInt(query.page), parseInt(query.page_size));
					res.send(setRes(resCode.OK, true, 'Your wishlist details.',(response.getPaginationInfo())));
				}else{
					res.send(setRes(resCode.ResourceNotFound, false, "Your wishlist is empty.",[]))
				}
			})
		}
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}

	
}

exports.RemoveProductWishlist = async(req,res) => {

	var data = req.body;
	var wishlistModel = models.wishlists;
	var userModel = models.user
	var productModel = models.products

	var requiredFields = _.reject(['user_id','product_id'], (o) => { return _.has(data, o)  })

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
						wishlistModel.findOne({
							where: {
								user_id: data.user_id,product_id : data.product_id, is_deleted: false
							}
						}).then(UserWishlistData => {
				
							if(UserWishlistData != null ){
				
								wishlistModel.update({is_deleted:true}, {
									where: {
										user_id: data.user_id,product_id : data.product_id, is_deleted: false
									}
								}).then(UpdateData =>{
									if(UpdateData > 0){
										wishlistModel.findOne({
											where: {
												user_id: data.user_id, is_deleted: false
											}
										}).then(data => {
											
											res.send(setRes(resCode.OK, true, "Product remove from wishlist successfully.",data))
										}).catch(error => {
											
											res.send(setRes(resCode.InternalServer, false, "Fail to remove product from wishlist.",null))
										})
									}
									
								})
							}else{
								res.send(setRes(resCode.ResourceNotFound, false, "Wishlist data not found",null))
							}
						})
					}
				})
			}
		})
		
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.AddToCart = async(req, res) => {

	var data = req.body;
	var wishlistModel = models.wishlists;
	var shoppingCartModel = models.shopping_cart
	var userModel = models.user
	var productModel = models.products

	var requiredFields = _.reject(['user_id','product_id','qty','price'], (o) => { return _.has(data, o)  })

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
						wishlistModel.findOne({where:{user_id:data.user_id,product_id:data.product_id,is_deleted:false}}).then(wishlistData => {

							if(wishlistData != null){
								shoppingCartModel.create(data).then(function (cartData){
				
									if(cartData){
										wishlistData.update({is_deleted:true})
				
										res.send(setRes(resCode.OK,true,"Product add into cart successfully",data))						
									}else{
										res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
									}
								})
							}else{
								res.send(setRes(resCode.ResourceNotFound,false,"Wishlist not found",null))
							}
						})
					}
				})
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}