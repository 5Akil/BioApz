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
	var Op = models.Op;

	var requiredFields = _.reject(['page','page_size'], (o) => { return _.has(query, o)  })

	if (requiredFields == ''){

		if(query.page < 0 || query.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1",null))
		}
		var skip = query.page_size * (query.page - 1)
		var limit = parseInt(query.page_size)

		var conditonFilter = {
			is_deleted:false
		}
		if(query.search && query.search != null && !_.isEmpty(query.search)){
			conditonFilter = {...conditonFilter, ...{[Op.or]: [{name: {[Op.like]: "%" + query.search + "%",}}],}}
		} 

		var condition2 = {
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
		condition2.where = {
			user_id: data.id,
			is_deleted: false
		}
		condition2.attributes = {exclude: ['createdAt','updatedAt','is_deleted']}

		var totalRecords = null

		wishlistModel.findAll(condition2).then(async(wishlist) => {
			totalRecords = wishlist.length
		})

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
			user_id: data.id,
			is_deleted: false
		}

		if(query.page_size != 0 && !_.isEmpty(query.page_size)){
			condition.offset = skip,
			condition.limit = limit
		}

		condition.attributes = {exclude: ['createdAt','updatedAt','is_deleted']}

		console.log(condition);
		await wishlistModel.findAll(condition).then(async wishlistData => {
	
			if(wishlistData != null && wishlistData != ""){
	
				for(var data of wishlistData){
					var isAddCart = false;
					if(data.product != null){
						await shoppingCartModel.findAll({
							where: {
								product_id: data.product.id,
								is_deleted: false
							},}).then(async addcart => {
								if(addcart.length > 0){
									isAddCart = true;
								}
							})
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

				const previous_page = (query.page - 1);
				const last_page = Math.ceil(totalRecords / query.page_size);
				var next_page = null;
				if(last_page > query.page){
					var pageNumber = query.page;
					pageNumber++;
					next_page = pageNumber;
				}
				
				var response = {};
				response.totalPages = (query.page_size == 0) ? 1 : Math.ceil(totalRecords/limit);
				response.currentPage = parseInt(query.page);
				response.per_page =  (query.page_size != 0) ? parseInt(query.page_size) : wishlistData.length;
				response.total_records = totalRecords;
				response.query = wishlistData;
				response.previousPage = (previous_page == 0) ? null : previous_page ;
				response.nextPage = next_page;
				response.lastPage = last_page;

				res.send(setRes(resCode.OK, true, 'Your wishlist details.',response));
			}else{
				res.send(setRes(resCode.ResourceNotFound, false, "Your wishlist is empty.",[]))
			}
		})

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