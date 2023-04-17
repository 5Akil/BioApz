var mongoose = require('mongoose')
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
const Sequelize = require('sequelize');
var notification = require('../../push_notification')
var moment = require('moment')
const MomentRange = require('moment-range');
var awsConfig = require('../../config/aws_S3_config');
const Moment = MomentRange.extendMoment(moment);
var fs = require('fs');

exports.CreatePromo = async (req, res) => {

	var data = req.body
	req.file ? data.image = `${req.file.key}`: '';
	var promosModel = models.promos
	
	console.log(data);

	var requiredFields = _.reject(['business_id', 'promo_code', 'description', 'repeat_every', 'end_date', 'start_date'], (o) => { return (o ? true : false) & _.has(data, o)  })

	data.repeat_every == 1 ? (data.repeat_on ? '' : requiredFields.push('repeat_on')) : '';

	_.contains([1,2], parseInt(data.repeat_every)) ? data.repeat = true : '';

	var repeat_on_validation = _.reject(data.repeat_on, (v) => {
		return _.has([0,1,2,3,4,5,6], parseInt(v))
	})

	if (repeat_on_validation == '') {
		
		if (requiredFields == ''){

			var Promo = await createPromo(data)

			if (Promo != ''){
				var Promo_image = await awsConfig.getSignUrl(Promo.image).then(function(res){
					Promo.image = res
				})
				res.send(setRes(resCode.OK, true, 'Promo created successfully.',Promo))
			}
			else{
				res.send(setRes(resCode.BadRequest, false, "Fail to create promo.",null))
			}

		}else{
			res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
		}

	} else {
		res.send(setRes(resCode.BadRequest, false, "repeat_on value must between 0-6...",null))
	}
}

function createPromo(data){
	var promosModel = models.promos

	return new Promise((resolve, reject) => {

		promosModel.create(data).then(promo => {
			if (promo != null) {
				resolve(promo);
			}
			else { 
				resolve('')
			}
		})
		.catch(error => {
			resolve('')
		})

	})
}

exports.UpdatePromo = (req, res) => {

	var data = req.body
	req.file ? data.image = `${req.file.key}`: '';
	var promosModel = models.promos
	
	var requiredFields = _.reject(['id'], (o) => { return (o ? true : false) & _.has(data, o)  })

	data.repeat_every == 1 ? (data.repeat_on ? '' : requiredFields.push('repeat_on')) : '';

	_.contains([1,2], parseInt(data.repeat_every)) ? data.repeat = true : '';

 	if (requiredFields == ''){


		promosModel.findOne({
			where: {
				id: data.id,
				is_deleted: false
			}
		}).then(PromoData => {

			if (PromoData) {

				if(data.image){
		
					const params = {
								    Bucket: awsConfig.Bucket,
								    Key: PromoData.image
								};
					awsConfig.deleteImageAWS(params)
				}

				promosModel.update(data, {
					where: {
						id: data.id,
						is_deleted: false
					}
				}).then(updatedPromo => {
					console.log(updatedPromo)
					if (updatedPromo > 0){
						
						promosModel.findOne({
							where: {
								id: data.id,
								is_deleted: false
							}
						}).then(async promo => {
							var promo_image = await awsConfig.getSignUrl(promo.image).then(function(res){
								promo.image = res
							});
							res.send(setRes(resCode.OK,true, "Promo updated successfully.",promo))
						}).catch(error => {
							
							res.send(setRes(resCode.InternalServer, false, "Fail to update promo.",null))
						})

					}
				})

			} else {
				res.send(setRes(resCode.ResourceNotFound, false, "Resource not found.",null))
			}
		}).catch(error => {
			res.send(setRes(resCode.InternalServer, false, "Internal server error.",null))
		})
		

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}
}

exports.GetPromos = (req, res) => {

	var resObj = {}
	var data = req.body
	var promosModel = models.promos;
	var businessModel = models.business
	var categoryModel = models.business_categorys
	var Op = models.Op

	var requiredFields = _.reject(['business_id'], (o) => { return (o ? true : false) & _.has(data, o)  })

 	if (requiredFields == ''){

		promosModel.update({
			is_deleted: true
		}, {
			where: {
				is_deleted: false,
				end_date: {
					[Op.lt]: moment().format('YYYY-MM-DD')
				}
			}
		}).then(updatedPromos => {
			
			promosModel.findAll({
				where: {
					business_id: data.business_id,
					is_deleted: false,
				},
				order: [
					['createdAt', 'DESC']
				],
				subQuery: false
			}).then(async promos => {
				
				_.each(promos, (o) => {

					let one = Moment.range(moment(`${data.from_date}T00:00:00.0000Z`), moment(`${data.to_date}T23:59:59.999Z`))
	
					let two = Moment.range(moment(`${o.start_date}T00:00:00.0000Z`), moment(`${o.end_date}T23:59:59.999Z`))
	
					let three = one.intersect(two)
	
					let four = three != null ? three.snapTo('day') : ''
	
					let five = three != null ? Array.from(three.by('days')) : ''
					
					_.each(five, (v) => {
						v = v.format('DD-MM-YYYY')
						if (o.repeat_every === 0) {
							if (v === moment(o.start_date).format('DD-MM-YYYY')) {
								_.has(resObj, v) === false ? resObj[v] = o : ''
							}
						} else if (o.repeat_every === 1) {
							var start = moment(o.start_date),
							end = moment(o.end_date),
							day = o.repeat_on.map(function(v) {
									return parseInt(v);
								});


							var now = start;

							while (now.isBefore(end) || now.isSame(end)) {
								if (v === moment(now).format('DD-MM-YYYY') && day.includes(moment(now,'YYYY-MM-DD').day())) {
									_.has(resObj, v) === false ? resObj[v] = o : ''
								}
								now.add(1, 'days');
							}

						} else if (o.repeat_every === 2) {
							
								_.has(resObj, v) === false ? resObj[v] = o : ''
							
						}
					})
				})

				///////////////////////////////////

				// get N element from object
				let arrRes = []
				if (data.limit && data.limit > 0){
					function firstN(obj, n) {
						return _.chain(obj)
						  .keys()
						  .sort()
						  .take(n)
						  .reduce(function(memo, current) {
							arrRes.push(obj[current]);
							return memo;
						  }, {})
						  .value();
					  }
					  
					firstN(resObj, data.limit)
				}
				//////////////////////////////////
				const offer = Object.keys(resObj)

				for(const offers of offer){

					var image_url = await awsConfig.getSignUrl(resObj[offers].dataValues.image).then(function(res){
						resObj[offers].dataValues.image_url = res
					})
					
				}
				res.send(setRes(resCode.OK , true, "Available Promos.",(data.limit ? arrRes : resObj)))
			})
			.catch(error => {
				
		
				res.send(setRes(resCode.InternalServer, false, "Internal server error",null))
			})

		}).catch(error => {
			console.log(error.message + ' ...promos.controller');
			res.send(setRes(resCode.InternalServer, false, 'Internal server error.',null))
		})

	}else{
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'),null))
	}

}
