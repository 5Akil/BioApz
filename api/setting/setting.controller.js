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
const Sequelize = require('sequelize');
var notification = require('../../push_notification')
var moment = require('moment')
const MomentRange = require('moment-range');
const Moment = MomentRange.extendMoment(moment);
var fs = require('fs');
var awsConfig = require('../../config/aws_S3_config');

exports.AddSettingData = async (req, res) => {

	var data = req.body
	var settingModel = models.settings
	var businessModel = models.business

	var requiredFields = _.reject(['business_id','setting_key', 'setting_label', 'setting_value'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
		businessModel.findOne({
			where:{
				id:data.business_id,
				is_deleted:false,
				is_active:true
			}
		}).then(async business => {
			if(_.isEmpty(business)){
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.",null))
			}else{
				settingModel.findOne({
					where:{
						business_id:data.business_id,
						setting_key:data.setting_key
					}
				}).then(settingDetail => {
		
					if(settingDetail != null){
						res.send(setRes(resCode.BadRequest,false,"This key data already exist.",null))
					}else{
		
						settingModel.create(data).then(settingData => {
							res.send(setRes(resCode.OK,true,"Data added successfully",data))
						}).catch(error => {
							res.send(setRes(resCode.InternalServer,false,"Internal server error.",null))
						})
					}
				})
			}
		})
		

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.GetSettingDetails = async (req , res) => {

	var data = req.body
	var setting_keys = data.setting_key.split(',');
	var Op = models.Op;
	var settingModel = models.settings

	var requiredFields = _.reject(['business_id','setting_key'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		settingModel.findAll({
			where:{
				business_id : data.business_id,
				setting_key:{
					[Op.in]:setting_keys
				},
				is_enable:true,
				is_deleted:false
			},
			attributes: { exclude: ['is_deleted', 'is_enable'] }
		}).then(settingData => {
			if(settingData != null){
				var setting_details = {};
				for(const data of settingData){
					setting_details[data.setting_key] = data;
				}
				settingData = setting_details
				res.send(setRes(resCode.OK,true,'Data get successfully',settingData))
			}else{

				res.send(setRes(resCode.ResourceNotFound,false,'Data not found',null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,false,"Internal server error.",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.UpdateSettingData = async (req, res) => {

	var data = req.body
	var settingModel = models.settings

	var requiredFields = _.reject(['id','setting_key'], (o) => { return _.has(data, o)  })

	if(requiredFields == "") {

		settingModel.findOne({
			where:{
				id:data.id,
				setting_key:data.setting_key,
				is_deleted:false,
				is_enable:true
			}
		}).then(settingData => {

			if(settingData != null ){

				settingModel.update(data,{
					where:{
						id:data.id,
						setting_key:data.setting_key
					}
				}).then(updateData => {

					if(updateData == 1) {

						settingModel.findOne({
							where:{
								id:data.id,
								setting_key:data.setting_key
							}
						}).then(settingDetails => {
							res.send(setRes(resCode.OK,true,'Setting data update successfully',settingDetails))
						})
					}else{
						res.send(setRes(resCode.BadRequest,false,'Fail to update data',null))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,"Setting not found",null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))	
	}
}