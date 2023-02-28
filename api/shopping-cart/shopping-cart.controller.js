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

exports.AddToCart = async(req,res) => {
	
	var data = req.body
	var shoppingCartModel = models.shopping_cart

	var requiredFields = _.reject(['user_id', 'product_id', 'qty','price'], (o) => { return _.has(data, o)  })

	if (requiredFields == ''){

		shoppingCartModel.findOne({where: {user_id: data.user_id,product_id : data.product_id, is_deleted: false}}).then(product => {
			if(product == null){

				shoppingCartModel.create(data).then(function (cartData) {
					if (cartData) {
						res.send(setRes(resCode.OK, cartData, true, 'Product added into cart successfully.'));
					} else {
						res.send(setRes(resCode.BadRequest, null, true, 'Fail to add into cart'));
					}
				});
				
			}else{

				var total_qty = parseInt(product.qty) + parseInt(data.qty)
				shoppingCartModel.update({qty:total_qty}, {
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
							
							res.send(setRes(resCode.OK, data, false, "Product quantity updated successfully."))
						}).catch(error => {
							
							res.send(setRes(resCode.InternalServer, null, true, "Fail to update product quantity."))
						})
					}
					
				})
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
	
}

exports.CartList = async(req,res) => {

	var data = req.body
	var shoppingCartModel = models.shopping_cart
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
				}
			],
		}).then(cartData => {

			if(cartData != null && cartData != ""){

				for(data of cartData){

					data.product.image = awsConfig.getSignUrl(data.product.image)
				}
				res.send(setRes(resCode.OK, cartData, true, 'Your cart details.'));
			}else{
				res.send(setRes(resCode.ResourceNotFound, null, false, "Your cart is empty."))
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}

exports.RemoveProductCart = async(req,res) => {

	var data = req.body;
	var shoppingCartModel = models.shopping_cart;

	var requiredFields = _.reject(['user_id','product_id'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
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
							
							res.send(setRes(resCode.OK, data, false, "Product remove from cart successfully."))
						}).catch(error => {
							
							res.send(setRes(resCode.InternalServer, null, true, "Fail to remove product from cart."))
						})
					}
					
				})
			}else{
				res.send(setRes(resCode.BadRequest, null, true, "Invalid user id or product id"))
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}