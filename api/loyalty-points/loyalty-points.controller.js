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

// Create Reward loyalty-points START
exports.create = async(req,res) =>{
	try{
		var data = req.body
		var businessModel = models.business
		var loyaltyPointModel = models.loyalty_points
		var Op = models.Op;
		var validation = true;

		let arrayFields = ['business_id','name','loyalty_type','points_earned','points_redeemed','validity','validity_period'];
		const result =  data.loyalty_type == 0 ? (arrayFields.push('amount')) : (arrayFields.push('product_id'));
		var requiredFields = _.reject(arrayFields, (o) => { return _.has(data, o)  })
		if(requiredFields.length == 0){
			var currentDate = (moment().format('YYYY-MM-DD') == moment(data.validity).format('YYYY-MM-DD'))
			var pastDate = moment(data.validity,'YYYY-MM-DD').isBefore(moment());
			if(data.amount != undefined && !(Number.isInteger(Number(data.amount))) && data.loyalty_type == 0 && !_.isEmpty(data.amount)){
				res.send(setRes(resCode.BadRequest,false, "Amount field invalid.!",null))
			}else if(currentDate || pastDate){
				res.send(setRes(resCode.BadRequest,false, "You can't select past and current date.!",null))
			}else{
				if(validation){
					if(data.product_id != null){
						var productModel = models.products
						productModel.findOne({
							where:{id:data.product_id,is_deleted:false}
						}).then(async product => {
							if(_.isEmpty(product)){
								return res.send(setRes(resCode.ResourceNotFound,false, "Product not found!",null))
							}
						})
					}
					businessModel.findOne({
						where:{id:data.business_id,is_deleted:false,is_active:true}
					}).then(async business => {
						if(_.isEmpty(business)){
							res.send(setRes(resCode.ResourceNotFound, false, "Business not found.",null))
						}else{
							await loyaltyPointModel.findOne({
								where: {isDeleted: false,status:true,name: {[Op.eq]: data.name}}
							}).then(async nameSame => {
								if(nameSame){
									res.send(setRes(resCode.BadRequest,false, "loyalty point name already taken.!",null))
								}else{
									loyaltyPointModel.create({
										business_id:!(_.isEmpty(data.business_id) && data.business_id == null) ? data.business_id : null,
										name:!(_.isEmpty(data.name) && data.name == null) ? data.name : null,
										loyalty_type:!(_.isEmpty(data.loyalty_type) && data.loyalty_type == null) ? data.loyalty_type : null,
										points_earned:!(_.isEmpty(data.points_earned) && data.points_earned == null) ? data.points_earned : null,
										points_redeemed:!(_.isEmpty(data.points_redeemed) && data.points_redeemed == null) ? data.points_redeemed : null,
										validity:!(_.isEmpty(data.validity) && data.validity == null) ? data.validity : null,
										validity_period:!(_.isEmpty(data.validity_period) && data.validity_period == null) ? data.validity_period : null,
										amount:(!(_.isEmpty(data.amount) && data.amount == null && _.isEmpty(data.loyalty_type)) && data.loyalty_type == 0) ? data.amount : null,
										product_id:(!(_.isEmpty(data.product_id) && data.product_id == null && _.isEmpty(data.product_id)) && data.loyalty_type == 1) ? data.product_id : null,
									}).then(async loyaltyData => {
										if(loyaltyData){
											res.send(setRes(resCode.OK,true,"Loyalty Point added successfully",loyaltyData))
										}else{
											res.send(setRes(resCode.BadRequest,false,"Fail to create loyalty point.",null))
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
// Create Reward loyalty-points END

// Delete Reward loyalty-point START
exports.delete = async(req,res) => {
	try{
		var data = req.params
		var loyaltyPointModel = models.loyalty_points
		var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })
		if(requiredFields == ""){
			loyaltyPointModel.findOne(
				{where: {id: data.id,status:true,isDeleted: false,deleted_at:null}
			}).then(async loyaltyData => {
				if (loyaltyData) {
					await loyaltyData.update({ 
						isDeleted: true,
						status:false
					}).then(async deleteData => {
						if(deleteData){
							await loyaltyData.findOne({
								where: {
									id: deleteData.id
								}
								}).then(async Data => {
									Data.destroy();
								});
						}
					});
					res.send(setRes(resCode.OK, true, "loyalty point deleted successfully", null))
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
// Delete Reward loyalty-point END

// Update Reward loyalty-point START
exports.update = async(req,res) => {
	try{
		var data = req.body
		var loyaltyPointModel = models.loyalty_points
		var businessModel = models.business
		var Op = models.Op;
		var validation = true;

		let arrayFields = ['id','name','loyalty_type','points_earned','points_redeemed','validity','validity_period'];
		const result =  data.loyalty_type == 0 ? (arrayFields.push('amount')) : (arrayFields.push('product_id'));
		var requiredFields = _.reject(arrayFields, (o) => { return _.has(data, o)  })
		if(requiredFields.length == 0){
			var currentDate = (moment().format('YYYY-MM-DD') == moment(data.validity).format('YYYY-MM-DD'))
			var pastDate = moment(data.validity,'YYYY-MM-DD').isBefore(moment());
			if(data.amount != undefined && !(Number.isInteger(Number(data.amount))) && data.loyalty_type == 0 && !_.isEmpty(data.amount)){
				res.send(setRes(resCode.BadRequest,false, "Amount field invalid.!",null))
			}else if(currentDate || pastDate){
				res.send(setRes(resCode.BadRequest,false, "You can't select past and current date.!",null))
			}else{
				loyaltyPointModel.findOne({
					where:{id: data.id,isDeleted: false,status: true,deleted_at:null}
				}).then(async loyaltyDetails => {
					if(_.isEmpty(loyaltyDetails)){
						res.send(setRes(resCode.ResourceNotFound, false, "Loyalty point not found.",null))
					}else{
						await loyaltyPointModel.findOne({
							where:{isDeleted:false,status:true,deleted_at:null,name:{[Op.eq]: data.name},id:{[Op.ne]: data.id}}
						}).then(async nameData => {
							if(nameData == null){
								loyaltyPointModel.update(
								{
									name:!(_.isEmpty(data.name) && data.name == null) ? data.name : null,
										loyalty_type:!(_.isEmpty(data.loyalty_type) && data.loyalty_type == null) ? data.loyalty_type : null,
										points_earned:!(_.isEmpty(data.points_earned) && data.points_earned == null) ? data.points_earned : null,
										points_redeemed:!(_.isEmpty(data.points_redeemed) && data.points_redeemed == null) ? data.points_redeemed : null,
										validity:!(_.isEmpty(data.validity) && data.validity == null) ? data.validity : null,
										validity_period:!(_.isEmpty(data.validity_period) && data.validity_period == null) ? data.validity_period : null,
										amount:(!(_.isEmpty(data.amount) && data.amount == null && _.isEmpty(data.loyalty_type)) && data.loyalty_type == 0) ? data.amount : null,
										product_id:(!(_.isEmpty(data.product_id) && data.product_id == null && _.isEmpty(data.product_id)) && data.loyalty_type == 1) ? data.product_id : null,
								}
									,
									{where: {id:data.id,isDeleted:false,status:true,deleted_at:null}
								}).then(async updateData => {
									if(updateData){
										loyaltyPointModel.findOne({where:{id:data.id}}).then(async data => {
											res.send(setRes(resCode.OK,true,'Loyalty point update successfully',data))
										})
									}else{
										res.send(setRes(resCode.BadRequest, false, "Fail to update loyalty point.",null))
									}
								})
							}else{
								res.send(setRes(resCode.BadRequest),false,"Loyalty point name already taken.!",null)
							}
						})
					}
				})
			}
		}else{
			res.send(setRes(resCode.BadRequest,false, (requiredFields.toString() + ' are required'),null))
		}

	}catch(error){
		res.send(setRes(resCode.BadRequest,false,"Something went wrong!",null))
	}
}
// Update Reward loyalty-point START