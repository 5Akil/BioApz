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

exports.AddCms = async (req, res) => {

	var data = req.body
	var cmsModel = models.cms_pages

	var requiredFields = _.reject(['business_id','page_key', 'page_label', 'page_value'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
		businessModel.findOne({
			where: {id: data.business_id,is_deleted: false,is_active:true}
		}).then(async business => {
			if(business){
				cmsModel.findOne({
					where:
					{
						page_key:data.page_key,
						business_id:data.business_id
					}
				}).then(pageDetail => {
		
					if(pageDetail != null){
						res.send(setRes(resCode.BadRequest,true,"This page data already exist",null))
					}else{
		
						cmsModel.create(data).then(cmsData => {
							res.send(setRes(resCode.OK,true,"Data added successfully",data))
						}).catch(error => {
							res.send(setRes(resCode.InternalServer,false,"Fail to add cms data",null))
						})
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
			}
		})

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.GetPageDetails = async (req , res) => {

	var data = req.body
	var page_keys = data.page_key.split(',');
	var Op = models.Op;
	var cmsModel = models.cms_pages
	var requiredFields = _.reject(['business_id','page_key'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		cmsModel.findAll({
			where:{
				business_id : data.business_id,
				page_key:{
					[Op.in]:page_keys
				},
				is_enable:true,
				is_deleted:false
			},
			attributes: { exclude: ['is_deleted', 'is_enable'] }
		}).then(pageData => {
			var page_details = {};
			if(pageData != null){
				
				for(const data of pageData){
					page_details[data.page_key] = data;
				}
				pageData = page_details
				res.send(setRes(resCode.OK,true,'Data get successfully',pageData))
			}else{

				res.send(setRes(resCode.ResourceNotFound,false,'Data not found',null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,false,"Fail to get page details",true))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.UpdatePageData = async (req, res) => {

	var data = req.body
	var cmsModel = models.cms_pages

	var requiredFields = _.reject(['id','page_key'], (o) => { return _.has(data, o)  })

	if(requiredFields == "") {

		cmsModel.findOne({
			where:{
				id:data.id,
				page_key:data.page_key,
				is_deleted:false,
				is_enable:true
			}
		}).then(pageData => {

			if(pageData != null ){

				cmsModel.update(data,{
					where:{
						id:data.id,
						page_key:data.page_key
					}
				}).then(updateData => {

					if(updateData == 1) {

						cmsModel.findOne({
							where:{
								id:data.id,
								page_key:data.page_key
							}
						}).then(pageDetails => {
							res.send(setRes(resCode.OK,true,'Page data update successfully',pageDetails))
						})
					}else{
						res.send(setRes(resCode.InternalServer,true,'Internal server error',null))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,"Page not found",null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,false,"Internal server error",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))	
	}
}