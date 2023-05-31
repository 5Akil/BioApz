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

// Create Reward coupones START
exports.create = async(req,res) =>{
	try{
		var data = req.body
		var businessModel = models.business
		var couponeModel = models.coupones
		var Op = models.Op;
		var validation = true;
		
		function generateCouponCode(length) {
			const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
			let couponCode = '';
			for (let i = 0; i < length; i++) {
				const randomIndex = Math.floor(Math.random() * characters.length);
				couponCode += characters.charAt(randomIndex);
			}
			return couponCode;
		}
		// Generate a unique coupon code with a length of 6 characters
		const couponCode = generateCouponCode(6);

		let arrayFields = ['business_id','title','coupon_type','order_value','validity_for','expire_at','description'];
		const result =  data.coupon_type == 0 ? (arrayFields.push('product_category_id','product_id')) : (arrayFields.push('value_type'));
		var valueType = (!(_.isEmpty(data.value_type)) && (data.value_type == 0)) ? ((data.order_value >= Math.min(1,100)) && (data.order_value <= Math.max(1,100))) : null

		var requiredFields = _.reject(arrayFields, (o) => { return _.has(data, o)  })
		
		if(requiredFields.length == 0){
			var currentDate = (moment().format('YYYY-MM-DD') == moment(data.expire_at).format('YYYY-MM-DD'))
			var pastDate = moment(data.expire_at,'YYYY-MM-DD').isBefore(moment());
			if(!(Number.isInteger(Number(data.order_value)))){
				res.send(setRes(resCode.BadRequest,false, "Amount field invalid.!",null))
			}else if(currentDate || pastDate){
				res.send(setRes(resCode.BadRequest,false, "You can't select past and current date.!",null))
			}else if(valueType == false && valueType != null){
				res.send(setRes(resCode.BadRequest,false, "Please enter valid percentage value!",null))
			}else{
				if(validation){
					businessModel.findOne({
						where:{id:data.business_id,is_deleted:false,is_active:true}
					}).then(async business => {
						if(_.isEmpty(business)){
							res.send(setRes(resCode.ResourceNotFound, false, "Business not found.",null))
						}else{
							await couponeModel.findOne({
								where: {isDeleted: false,status:true,title: {[Op.eq]: data.title}}
							}).then(async couponSame => {
								if(couponSame){
									res.send(setRes(resCode.BadRequest,false, "Coupon title already taken.!",null))
								}else{
									couponeModel.create(
										{
										business_id:!(_.isEmpty(data.business_id) && data.business_id == null) ? data.business_id : null,
										title:!(_.isEmpty(data.title) && data.title == null) ? data.title : null,
										coupon_type:!(_.isEmpty(data.coupon_type) && data.coupon_type == null) ? data.coupon_type : null,
										product_category_id:(!(_.isEmpty(data.product_category_id) && data.product_category_id == null)) && data.coupon_type == 0 ? data.product_category_id : null,
										product_id:(!(_.isEmpty(data.product_id) && data.product_id == null)) && (!_.isEmpty(data.product_category_id)) && data.coupon_type == 0  ? data.product_id : null,
										value_type:!(_.isEmpty(data.value_type) && data.value_type == null) && data.coupon_type == 1 && data.coupon_type != null ? data.value_type : null,
										order_value:(!(_.isEmpty(data.order_value) && data.order_value == null)) ? data.order_value : null,
										validity_for:!(_.isEmpty(data.validity_for) && data.validity_for == null) ? data.validity_for : null,
										expire_at:!(_.isEmpty(data.expire_at) && data.expire_at == null) ? data.expire_at : null,
										description:!(_.isEmpty(data.description) && data.description == null) ? data.description : null
									}
									).then(async couponeData => {
										if(couponeData){
											res.send(setRes(resCode.OK,true,"Coupon added successfully",couponeData))
										}else{
											res.send(setRes(resCode.InternalServer,false,"Fail to create coupon.",null))
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
		console.log(error)
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}
// Create Reward coupones END

// Delete Reward coupones START
exports.delete = async(req,res) => {
	try{
		var data = req.params
		var couponeModel = models.coupones
		var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })
		if(requiredFields == ""){
			couponeModel.findOne(
				{where: {id: data.id,status:true,isDeleted: false,deleted_at:null}
			}).then(async couponeData => {
				if (couponeData) {
					await couponeData.update({ 
						isDeleted: true,
						status:false
					}).then(async deleteData => {
						if(deleteData){
							await couponeModel.findOne({
								where: {
									id: deleteData.id
								}
								}).then(async Data => {
									Data.destroy();
								});
						}
					});
					res.send(setRes(resCode.OK, true, "Coupones deleted successfully", null))
				} else {
					res.send(setRes(resCode.ResourceNotFound, false, "Coupone not found", null))
				}
			}).catch(error => {
				res.send(setRes(resCode.BadRequest, false, error, null))
			})
		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}
// Delete Reward coupones END

// Update Reward coupones START
exports.update =async(req,res) => {
	try{
		var data = req.body
		var businessModel = models.business
		var couponeModel = models.coupones
		var Op = models.Op;
		var validation = true;
		let arrayFields = ['id','title','coupon_type','order_value','validity_for','expire_at','description'];
		const result =  data.coupon_type == 0 ? (arrayFields.push('product_category_id','product_id')) : (arrayFields.push('value_type'));
		var valueType = (!(_.isEmpty(data.value_type)) && (data.value_type == 0)) ? ((data.order_value >= Math.min(1,100)) && (data.order_value <= Math.max(1,100))) : null

		var requiredFields = _.reject(arrayFields, (o) => { return _.has(data, o)  })
		
		if(requiredFields.length == 0){
			var currentDate = (moment().format('YYYY-MM-DD') == moment(data.expire_at).format('YYYY-MM-DD'))
			var pastDate = moment(data.expire_at,'YYYY-MM-DD').isBefore(moment());
			if(!(Number.isInteger(Number(data.order_value)))){
				res.send(setRes(resCode.BadRequest,false, "Amount field invalid.!",null))
			}else if(currentDate || pastDate){
				res.send(setRes(resCode.BadRequest,false, "You can't select past and current date.!",null))
			}else if(valueType == false && valueType != null){
				res.send(setRes(resCode.BadRequest,false, "Please enter valid percentage value!",null))
			}else{
				if(validation){
					couponeModel.findOne({
						where:{id: data.id,isDeleted: false,status: true,deleted_at:null}
					}).then(async couponeDetails => {
						if(_.isEmpty(couponeDetails)){
							res.send(setRes(resCode.ResourceNotFound, false, "Coupon not found.",null))
						}else{
							await couponeModel.findOne({
								where:{isDeleted:false,status:true,deleted_at:null,title:{[Op.eq]: data.title},id:{[Op.ne]: data.id}}
							}).then(async nameData => {
								if(nameData == null){
									couponeModel.update({
										title:!(_.isEmpty(data.title) && data.title == null) ? data.title : null,
										coupon_type:!(_.isEmpty(data.coupon_type) && data.coupon_type == null) ? data.coupon_type : null,
										product_category_id:(!(_.isEmpty(data.product_category_id) && data.product_category_id == null)) && data.coupon_type == 0 ? data.product_category_id : null,
										product_id:(!(_.isEmpty(data.product_id) && data.product_id == null)) && (!_.isEmpty(data.product_category_id)) && data.coupon_type == 0  ? data.product_id : null,
										value_type:!(_.isEmpty(data.value_type) && data.value_type == null) && data.coupon_type == 1 && data.coupon_type != null ? data.value_type : null,
										order_value:(!(_.isEmpty(data.order_value) && data.order_value == null)) ? data.order_value : null,
										validity_for:!(_.isEmpty(data.validity_for) && data.validity_for == null) ? data.validity_for : null,
										expire_at:!(_.isEmpty(data.expire_at) && data.expire_at == null) ? data.expire_at : null,
										description:!(_.isEmpty(data.description) && data.description == null) ? data.description : null
									},
										{where: {id:data.id,isDeleted:false,status:true,deleted_at:null}
									}).then(async updateData => {
										if(updateData){
											couponeModel.findOne({where:{id:data.id}}).then(async data => {
												res.send(setRes(resCode.OK,true,'coupon update successfully',data))
											})
										}else{
											res.send(setRes(resCode.BadRequest, false, "Fail to update coupon.",null))
										}
									})
								}else{
									res.send(setRes(resCode.BadRequest),false,"Coupon title already taken.!",null)
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
		res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}
// Update Reward coupones START