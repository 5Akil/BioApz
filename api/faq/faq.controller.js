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
const pagination = require('../../helpers/pagination');

exports.StoreFaq = async(req, res) => {

	var data = req.body
	var faqModel = models.faqs

	var requiredFields = _.reject(['business_id', 'title', 'description'], (o) => { return _.has(data, o)  })

	
	const businessModel = models.business;
	const userModel = models.user;
	const userEmail = req.userEmail;
	
	if(requiredFields == ""){
		let userDetails;
		userDetails = await businessModel.findOne({
			where: {
				email: userEmail,
				is_deleted: false,
				is_active:true
			}
		})
	
		if (!userDetails || _.isEmpty(userDetails)) {
			userDetails = await userModel.findOne({
				where: {
					email: userEmail,
					is_deleted: false,
					is_active:true
				}
			})
		}
		// Restrict Business user to update faq of other business
		const userRole = userDetails?.role_id || 0;
		if (userRole && userRole === 3) {
			if (userDetails?.id != data?.business_id) {
				return res.send(setRes(resCode.BadRequest,false,"Invalid auth token to add faq for Business.",null))
			}
		}

		businessModel.findOne({
			where: {id: data.business_id,is_deleted: false,is_active:true}
		}).then(async business => {
			if(business){
				faqModel.create(data).then(faqData => {
					res.send(setRes(resCode.OK,true,"FAQ added successfully.",data))
				}).catch(error => {
					res.send(setRes(resCode.BadRequest,false,"Fail to add FAQ.",null))
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
			}
		})
		
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.GetFaqList = async(req, res ) => {

	var data = req.body
	var faqModel = models.faqs

	var requiredFields = _.reject(['business_id', 'page', 'page_size'], (o) => { return _.has(data, o)  })

	if(requiredFields == ""){
		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, false, "invalid page number, should start with 1.",null))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)
		const faqRecords  = await faqModel.findAndCountAll({
			where:{
				business_id:data.business_id,
				is_deleted:false
			}
		});
		const totalRecords = faqRecords?.count;
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
				const response = new pagination(faqData, totalRecords, parseInt(data.page), parseInt(data.page_size));
				res.send(setRes(resCode.OK,true,"FAQ get successfully.",(response.getPaginationInfo())))
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,"FAQ not found.",null))
			}
		}).catch(error => {
			res.send(setRes(resCode.BadRequest,false,"Fail to get FAQ.",null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required.'),null))	
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
			res.send(setRes(resCode.OK,true,"FAQ get successfully.",faqData))
		}else{
			res.send(setRes(resCode.ResourceNotFound,false,"FAQ not found.",null))
		}
	}).catch(error => {
		res.send(setRes(resCode.BadRequest,false,"Fail to get FAQ.",null))
	})
}

exports.UpdateFaq = async (req, res ) => {

	var data = req.body
	var faqModel = models.faqs

	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })
	const businessModel = models.business;
	const userEmail = req.userEmail;

	const businessUserDetails = await businessModel.findOne({
		where: {
			email: userEmail,
			is_deleted: false,
			is_active:true
		}
	})

	// Check for faq created by this business user or not
	if (businessUserDetails) {
		const faqExists = await faqModel.findOne({
			where:{
				business_id : businessUserDetails.id,
				id:data.id,
				is_deleted:false
			}
		})
		if (!faqExists) {
			return res.send(setRes(resCode.BadRequest,false,"Invalid auth token to add faq for Business.",null))
		}
	}

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
							res.send(setRes(resCode.OK,true,"FAQ update successfully.",faqDetail))
						})
					}else{
						res.send(setRes(resCode.BadRequest,false,'Fail to update FAQ.',null))
					}
				})
			}else{
				res.send(setRes(resCode.ResourceNotFound,false,"FAQ not found.",null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer,false,'Internal server error.',null))
		})
	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))	
	}

}
exports.RemoveFaq = async (req, res ) => {

	var data = req.params
	var faqModel = models.faqs

	const businessModel = models.business;
	const userEmail = req.userEmail;

	const businessUserDetails = await businessModel.findOne({
		where: {
			email: userEmail,
			is_deleted: false,
			is_active:true
		}
	})

	// Check for faq created by this business user or not
	if (businessUserDetails) {
		const faqExists = await faqModel.findOne({
			where:{
				business_id : businessUserDetails.id,
				id:data.id,
				is_deleted:false
			}
		})
		if (!faqExists) {
			return res.send(setRes(resCode.BadRequest,false,"Invalid auth token to delete faq for Business.",null))
		}
	}

	faqModel.findOne({
		where:{
			id:data.id,
			is_deleted:false
		}
	}).then(faqData => {

		if(faqData != null){

			faqData.update({is_deleted:true})
			res.send(setRes(resCode.OK,true,"FAQ deleted successfully.",null))
		}else{
			res.send(setRes(resCode.ResourceNotFound,false,"FAQ not found.",null))
		}
	}).catch(error => {
		res.send(setRes(resCode.BadRequest,false,"Fail to delete FAQ.",null))
	})
}