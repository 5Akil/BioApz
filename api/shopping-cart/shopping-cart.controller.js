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

exports.AddToCart = async(req,res) => {
	
	var data = req.body
	var shoppingCartModel = models.shopping_cart
	var orderDetailsModel = models.order_details
	var userModel = models.user
	var productModel = models.products

	var requiredFields = _.reject(['user_id', 'product_id', 'qty','price'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){
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
						orderDetailsModel.findOne({where: {product_id:data.product_id, is_deleted: false}}).then(OrderData => {
							if(OrderData == null){
				
								shoppingCartModel.findOne({where: {user_id: data.user_id,product_id : data.product_id, is_deleted: false}}).then(product => {
									if(product == null){
				
										shoppingCartModel.create(data).then(function (cartData) {
											if (cartData) {
												res.send(setRes(resCode.OK, true, 'Product added into cart successfully.',cartData));
											} else {
												res.send(setRes(resCode.BadRequest, false, 'Fail to add into cart',null));
											}
										});
										
									}else{
				
										res.send(setRes(resCode.BadRequest, false, 'Product already into a cart...',null));
									}
								})
							}else{
				
								res.send(setRes(resCode.ResourceNotFound,false,'Product not available..',null))
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

exports.CartList = async(req,res) => {

	var data = req.body
	var shoppingCartModel = models.shopping_cart
	var productCategoryModel = models.product_categorys
	var productModel = models.products;

	var requiredFields = _.reject(['user_id'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){

		shoppingCartModel.findAll({
			where:{
				user_id: data.user_id,
				is_deleted: false
			},
			include: [
				{
					model: productModel
				},
				{
					model: productCategoryModel
				}
			],
			attributes: {exclude: ['createdAt','updatedAt','is_deleted']}
		}).then(async cartData => {

			if(cartData != null && cartData != ""){
				for(data of cartData){

					if(data.product != null){
						if(data.product.image != null && !_.isEmpty(data.product.image)){
							var product_image = await awsConfig.getSignUrl(data.product.image[0]).then(function(res){
								data.dataValues.product_image = res;
							})
						}else{
							data.dataValues.product_image = commonConfig.default_image
						}

						// console.log(data)
						if(data.product.name != null){

							data.dataValues.product_name = data.product.name
						}else{
							data.dataValues.product_name = null
						}

						// console.log(data)
						if(data.product.price != null){

							data.dataValues.price = data.product.price
						}else{
							data.dataValues.price = null
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
						delete data.dataValues.product
					}

					// console.log(data)
					if(data.product_category != null){

						data.dataValues.category_name = data.product_category.name
						delete data.dataValues.product_category
					}else{
						data.dataValues.category_name = ""
					}
					// if(data.sub_category != null){

					// 	data.dataValues.product_type = data.sub_category.name
					// 	delete data.dataValues.sub_category
					// }else{
					// 	data.dataValues.product_type = "";
					// }
				}
				
				res.send(setRes(resCode.OK, true, 'Your cart details.',cartData));
			}else{
				res.send(setRes(resCode.OK, true, "Your cart is empty.",null))
			}
		}).catch(error => {
			console.log(error)
			res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.RemoveProductCart = async(req,res) => {

	var data = req.body;
	var shoppingCartModel = models.shopping_cart;
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
						shoppingCartModel.findOne({
							where: {
								user_id: data.user_id,product_id : data.product_id, is_deleted: false
							}
						}).then(UserCartData => {
				
							if(UserCartData != null ){
				
								shoppingCartModel.update({is_deleted:true}, {
									where: {
										user_id: data.user_id,product_id : data.product_id, is_deleted: false
									}
								}).then(UpdateData =>{
									if(UpdateData > 0){
										shoppingCartModel.findOne({
											where: {
												user_id: data.user_id, is_deleted: false
											}
										}).then(data => {
											
											res.send(setRes(resCode.OK, true, "Product remove from cart successfully.",data))
										}).catch(error => {
											
											res.send(setRes(resCode.InternalServer, false, "Fail to remove product from cart.",null))
										})
									}
									
								})
							}else{
								res.send(setRes(resCode.ResourceNotFound, false, "Shopping card not found",null))
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

exports.QtyUpdate = async(req,res) => {

	var data = req.body;
	var shoppingCartModel = models.shopping_cart;
	var userModel = models.user
	var productModel = models.products

	var requiredFields = _.reject(['user_id','product_id','qty'], (o) => { return _.has(data, o)  })
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
						shoppingCartModel.findOne({
							where: {
								user_id: data.user_id,product_id : data.product_id, is_deleted: false
							}
						}).then(UserCartData => {
							
							if(UserCartData != null){
								shoppingCartModel.update({qty:data.qty}, {
									where: {
										user_id: data.user_id,product_id : data.product_id, is_deleted: false
									}
								}).then(UpdateData =>{
									if(UpdateData > 0){
				
										shoppingCartModel.findOne({
											where: {
												user_id: data.user_id,product_id : data.product_id, is_deleted: false
											}
										}).then(data => {
											
											res.send(setRes(resCode.OK, true, "Quantity update successfully.",data))
										}).catch(error => {
											
											res.send(setRes(resCode.BadRequest, false ,"Fail to update quantity.",null))
										})
									}else{
										res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
									}
								});
							}else{
								res.send(setRes(resCode.ResourceNotFound,false,"Shopping cart not found",null))
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