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

exports.AddToWishList = async(req, res) =>{

	var data = req.body
	var wishlistModel = models.wishlists

	var requiredFields = _.reject(['user_id', 'product_id','price'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
		wishlistModel.findOne({where: {user_id: data.user_id,product_id : data.product_id, is_deleted: false}}).then(product => {
			if(product == null){

				wishlistModel.create(data).then(function (wishlistData) {
					if (wishlistData) {
						res.send(setRes(resCode.OK, wishlistData, true, 'Product added into wishlist successfully.'));
					} else {
						res.send(setRes(resCode.BadRequest, null, true, 'Fail to add into cart'));
					}
				});
				
			}else{

				res.send(setRes(resCode.BadRequest, null, true, 'Product already into a wishlist...'));
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}

exports.wishlistData = async (req, res) => {

	var data = req.params
	var wishlistModel = models.wishlists
	var productModel = models.products

	wishlistModel.findAll({
		where:{
			user_id: data.id,
			is_deleted: false
		},
		include: [
			{
				model: productModel
			}
		],
	}).then(wishlistData => {

		if(wishlistData != null && wishlistData != ""){

			for(data of wishlistData){

				data.product.image = awsConfig.getSignUrl(data.product.image)
			}
			res.send(setRes(resCode.OK, wishlistData, true, 'Your wishlist details.'));
		}else{
			res.send(setRes(resCode.ResourceNotFound, null, false, "Your wishlist is empty."))
		}
	})
}

exports.RemoveProductWishlist = async(req,res) => {

	var data = req.body;
	var wishlistModel = models.wishlists;

	var requiredFields = _.reject(['user_id','product_id'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
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
							
							res.send(setRes(resCode.OK, data, false, "Product remove from wishlist successfully."))
						}).catch(error => {
							
							res.send(setRes(resCode.InternalServer, null, true, "Fail to remove product from wishlist."))
						})
					}
					
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound, null, false, "Data not found"))
			}
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}

exports.AddToCart = async(req, res) => {

	var data = req.body;
	var wishlistModel = models.wishlists;
	var shoppingCartModel = models.shopping_cart

	var requiredFields = _.reject(['user_id','product_id','qty','price'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		wishlistModel.findOne({where:{user_id:data.user_id,product_id:data.product_id,is_deleted:false}}).then(wishlistData => {

			if(wishlistData != null){
				shoppingCartModel.create(data).then(function (cartData){

					if(cartData){
						wishlistData.update({is_deleted:true})

						res.send(setRes(resCode.OK,data,false,"Product add into cart successfully"))						
					}else{
						res.send(setRes(resCode.InternalServer,null,true,"Internal server error"))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound,null,false,"Data not found"))
			}
		})
			
		
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}