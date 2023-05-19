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

// Create Reward cashbacks START
exports.cashbackCreate = async(req,res) =>{
	try{
		var data = req.body
		var cashbackModel = models.cashbacks
		var businessModel = models.business
		var Op = models.Op;
		var validation = true;

		var requiredFields = _.reject(['business_id','title','cashback_on','cashback_type','amount','product_category_id','product_id','validity_for'], (o) => { return _.has(data, o)  })
		const result =  data.cashback_type == 0 ? (!((data.amount >= Math.min(1,100)) && (data.amount <= Math.max(1,100))) ? true : false) : '';
		console.log(result)
		if(requiredFields == ""){
			if(result){
				res.send(setRes(resCode.BadRequest,false, "Please selete valid amount value in percentage(between 1 to 100)!",null))
			}else{
				if(validation){{
				businessModel.findOne({
					where:{id:data.business_id,is_deleted:false,is_active:true}
				}).then(async business => {
					if(_.isEmpty(business)){
						res.send(setRes(resCode.ResourceNotFound, false, "Business not found.",null))
					}else{
						await cashbackModel.findOne({
								where: {isDeleted: false,status:true,title: {[Op.eq]: data.title}
							}
						}).then(async cashbackData => {
							if(cashbackData){
								res.send(setRes(resCode.BadRequest,false, "Cashback title already taken.!",null))
							}else{
								cashbackModel.create(data).then(async responseData => {
									if(responseData){
										res.send(setRes(resCode.OK,true,"Cashback added successfully",responseData))
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
		}
		}else {
			res.send(setRes(resCode.BadRequest,false, (requiredFields.toString() + ' are required'),null))
		}
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}
// Create Reward cashbacks END

// View Reward Cashback START
exports.cashbackView =async(req,res) => {
	try{
		var data = req.params
		var cashbackModel = models.cashbacks

		cashbackModel.findOne({
			where:{id:data.id,status:true,isDeleted:false}
		}).then(async cashbackData => {
			if (cashbackData != null){
				if(cashbackData.image != null){
					var cashbackData_image = await awsConfig.getSignUrl(cashbackData.image).then(function(res){
						cashbackData.image = res;
					})
				}else{
					cashbackData.image = commonConfig.default_image;
				}
				res.send(setRes(resCode.OK, true, "Get cashbacks detail successfully.",cashbackData))
			}
			else{
				res.send(setRes(resCode.ResourceNotFound,false, "Cashback not found.",null))
			}
		}).catch(error2 => {
			res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
		})
	}catch(error){
		res.send(setRes(resCode.BadRequest,false, "Something went wrong!",null))
	}
}
// View Reward Cashback END

// Delete Reward Gift Card START
exports.deleteGiftCard =async(req,res) => {
	try{
		var data = req.params
		var cashbackModel = models.cashbacks
		var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })

		if(requiredFields == ""){
			cashbackModel.findOne({
			where: {
				id: data.id,
				status:true,
				isDeleted: false
			}
			}).then(async cashbackData => {
				var timestamps = moment().format('YYYY-MM-DD HH:mm:ss')
				if (cashbackData) {
					await cashbackData.update({ 
						isDeleted: true,
						status:false
					}).then(async deleteData => {
						if(deleteData){
							await cashbackModel.findOne({
								where: {
									id: deleteData.id
								}
								}).then(async Data => {
									Data.destroy();
								});
						}
					});
					res.send(setRes(resCode.OK, true, "Cashback deleted successfully", null))
				} else {
					res.send(setRes(resCode.ResourceNotFound, false, "Cashback not found", null))
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