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

exports.StoreFaq = async(req, res) => {

	var data = req.body
	var faqModel = models.faqs

	var requiredFields = _.reject(['business_id', 'title', 'description'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		faqModel.create(data).then(faqData => {
			res.send(setRes(resCode.OK,data,false,"Faq added successfully"))
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,null,true,"Fail to add faq"))
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}

exports.GetFaqList = async(req, res ) => {

	var data = req.body
	var faqModel = models.faqs

	var requiredFields = _.reject(['business_id', 'page', 'page_size'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, null, true, "invalid page number, should start with 1"))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)

		faqModel.findAll({
			where:{
				business_id:data.business_id,
				is_deleted:false
			},
			offset:skip,
			limit:limit,
			order: [
				['createdAt', 'DESC']
			]
		}).then(faqData => {
			if(faqData.length > 0){

				res.send(setRes(resCode.OK,faqData,false,"Faq get successfully"))
			}else{
				res.send(setRes(resCode.ResourceNotFound,null,false,"Faq not found"))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,null,true,"Fail to get faq"))
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))	
	}

}

exports.GetFaqById = async (req,res) => {

	var data = req.params
	var faqModel = models.faqs

	faqModel.findOne({
		where:{
			id:data.id,
			is_deleted:false
		}
	}).then(faqData => {
		if(faqData != null){

			res.send(setRes(resCode.OK,faqData,false,"Faq get successfully"))
		}else{
			res.send(setRes(resCode.ResourceNotFound,null,false,"Faq not found"))
		}
	}).catch(error => {
		res.send(setRes(resCode.InternalServer,null,true,"Fail to get faq"))
	})
}

exports.UpdateFaq = async (req, res ) => {

	var data = req.body
	var faqModel = models.faqs

	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){

		faqModel.findOne({
			where:{
				id:data.id,
				is_deleted:false
			}
		}).then(faqData => {

			if(faqData != null){

				faqModel.update(data,{
					where:{
						id:data.id,
						is_deleted:false
					}
				}).then(updateData => {

					if(updateData == 1){
						faqModel.findOne({
							where:{
								id:data.id,
								is_deleted:false
							}
						}).then(faqDetail => {
							res.send(setRes(resCode.OK,faqDetail,false,"Faq update successfully"))
						})
					}else{
						res.send(setRes(resCode.InternalServer,null,true,'Fail to update'))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound,null,false,"Faq not found"))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,null,true,'Fail to update'))
		})
	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))	
	}

}
exports.RemoveFaq = async (req, res ) => {

	var data = req.params
	var faqModel = models.faqs

	faqModel.findOne({
		where:{
			id:data.id,
			is_deleted:false
		}
	}).then(faqData => {

		if(faqData != null){

			faqData.update({is_deleted:true})
			res.send(setRes(resCode.OK,null,false,"Faq deleted successfully"))
		}else{
			res.send(setRes(resCode.ResourceNotFound,null,false,"Faq not found"))
		}
	}).catch(error => {
		res.send(setRes(resCode.InternalServer,null,true,"Fail to delete "))
	})
}