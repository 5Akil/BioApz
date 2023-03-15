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

exports.ComboCalendar = async (req, res) => {

	var data = req.body
	var filesData = req.files;
	var comboModel = models.combo_calendar
	var Op = models.Op
	var validation = true;

	var requiredFields = _.reject(['business_id', 'title', 'description', 'repeat_every', 'end_date', 'start_date'], (o) => { return _.has(data, o)  })

	data.repeat_every == 1 ? (data.repeat_on ? '' : requiredFields.push('repeat_on')) : '';

	_.contains([1,2], parseInt(data.repeat_every)) ? data.repeat = true : '';

	var repeat_on_validation = _.reject(data.repeat_on, (v) => {
		return _.has([0,1,2,3,4,5,6], parseInt(v))
	})

	if (repeat_on_validation == '') {
		
		if (requiredFields == ''){

			if(filesData.length == 0){
				res.send(setRes(resCode.BadRequest, null, true, 'At least one image is required for product'))
				validation = false;
			}else if(filesData.length > 5){
				validation = false;
				res.send(setRes(resCode.BadRequest, null, true, 'You can upload only 5 images'))
			}
			if(filesData.length !=0 && filesData.length <= 5){
				for(const image of filesData){
					const fileContent = await fs.promises.readFile(image.path);
					const fileExt = `${image.originalname}`.split('.').pop();
					if(image.size > commonConfig.maxFileSize){
						validation = false;
						res.send(setRes(resCode.BadRequest, null, true, 'You can upload only 5 mb files, some file size is too large'))
					}else if (!commonConfig.allowedExtensions.includes(fileExt)) {
					  // the file extension is not allowed
					  validation = false;
					  res.send(setRes(resCode.BadRequest, null, true, 'You can upload only jpg, jpeg, png, gif files'))
					}
				}

			}

			// data.start_date ? '' : data.start_date = moment().toISOString()

			// data.end_date ? '' : data.end_date = moment().add(24, 'hours').toISOString()

			// if (data.overwrite === 'true'){

			// 	// comboModel.findAll({
			// 	// 	where: {
			// 	// 		is_deleted: false,
			// 	// 		business_id: data.business_id,
			// 	// 	}
			// 	// }).then(async combos => {

			// 	// 	let newRepeatOn;
			// 	// 	_.each(combos, (o) => {
			// 	// 		let arr = [];
			// 	// 		typeof data.repeat_on == 'string' ? arr.push(data.repeat_on) : arr = data.repeat_on;

			// 	// 		newRepeatOn = _.difference(o.repeat_on, arr)

			// 	// 		if (moment(moment(o.start_date) > moment(data.start_date) ? o.start_date : data.start_date) <= moment(moment(o.end_date) < moment(data.end_date) ? o.end_date : data.end_date)) {

			// 	// 			comboModel.update({
			// 	// 				repeat_on: newRepeatOn,
			// 	// 				is_deleted: newRepeatOn != '' ? false : true
			// 	// 			}, {
			// 	// 				where: {
			// 	// 					id: o.id
			// 	// 				}
			// 	// 			}).then(updatedCombos => {
			// 	// 			}).catch(error => {
			// 	// 				console.log('=========create combo error=========')
			// 	// 				console.log(error.message)
			// 	// 				req.send(setRes(resCode.InternalServer, null, true, "Internal server error"))
			// 	// 			})

			// 	// 		}
						
			// 	// 	})
					
			// 		var comboOffer = await createComboOffer(data)

			// 		if (comboOffer != ''){
			// 			res.send(setRes(resCode.OK, comboOffer, false, 'combo offer created successfully.'))
			// 		}
			// 		else{
			// 			res.send(setRes(resCode.BadRequest, null, true, "Fail to create combo offer."))
			// 		}

			// 	// })
			// 	// .catch(error => {
			// 	// 	res.send(setRes(resCode.InternalServer, error.message, true, ""))
			// 	// })

			// }
			// else{
				if(validation){

					var comboOffer = await createComboOffer(data)

					if (comboOffer != ''){
						const lastInsertId = comboOffer.id;
						if(lastInsertId){

							var files = [];
							for(const file of filesData){
								
								const fileContent = await fs.promises.readFile(file.path);
								const fileExt = `${file.originalname}`.split('.').pop()
								const randomString = Math.floor(Math.random() * 1000000); 
								const fileName = `${Date.now()}_${randomString}.${fileExt}`;
								const params = {
								   Bucket: awsConfig.Bucket,
							       Key: `combos/${lastInsertId}/${fileName}`,
							       Body: fileContent,
					     		};

							  const result = await awsConfig.s3.upload(params).promise();
							  if(result){
									files.push(`combos/${lastInsertId}/${fileName}`)
									fs.unlinkSync(file.path)
				     			}				  
							}
							var images = files.join(';');
							comboModel.update({
								images: images
							},{
								where: {
									id: lastInsertId,
									
								}
							}).then(comboData => {
								if(comboData){
									comboModel.findOne({where:{id:lastInsertId}}).then(getData => {
										var combo_images = getData.images
										var image_array = [];
										for(const data of combo_images){
											const signurl = awsConfig.getSignUrl(data);
						  					image_array.push(signurl);
										}
										getData.dataValues.combo_images = image_array
										
										res.send(setRes(resCode.OK,getData,null,"Combo offer created successfully"))
									})
								}else{
									res.send(setRes(resCode.InternalServer,getData,null,"Image not update"))
								}
							})
						}
						
					}
					else{
						res.send(setRes(resCode.BadRequest, null, true, "Fail to create combo offer."))
					}
				}
				
			// }
			

		}else{
			res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
		}

	} else {
		res.send(setRes(resCode.BadRequest, '', true, "repeat_on value must between 0-6..."))
	}
}


function createComboOffer(data){
	var comboModel = models.combo_calendar

	return new Promise((resolve, reject) => {

		comboModel.create(data).then(combo => {
			if (combo != null) {
				resolve(combo);
				// res.send(setRes(resCode.OK, combo, false, 'combo offer created successfully.'))
			}
			else { 
				resolve('')
				// res.send(setRes(resCode.BadRequest, null, true, "Fail to create combo offer."))
			}
		})
		.catch(error => {
			resolve('')
			// res.send(setRes(resCode.InternalServer, error.message, true, "Internal server error"))
		})

	})
}


exports.GetComboOffers = (req, res) => {


	var resObj = {}
	var data = req.body
	var comboModel = models.combo_calendar
	var Op = models.Op

	var requiredFields = _.reject(['business_id'], (o) => { return _.has(data, o)  })

 	if (requiredFields == ''){

		comboModel.update({
			is_deleted: true
		}, {
			where: {
				is_deleted: false,
				end_date: {
					[Op.lt]: moment().format('YYYY-MM-DD')
				}
			}
		}).then(updatedOffers => {
			
			comboModel.findAll({
				where: {
					business_id: data.business_id,
					//is_deleted: false,
				},
				order: [
					['createdAt', 'DESC']
				],
				subQuery: false
			}).then(combos => {

				// console.log(JSON.parse(JSON.stringify(combos)))
				// var start = moment(combos[0].start_date).subtract(1, 'day'),
				// end   = moment(combos[0].end_date).add(1, 'day'),
				// day   = [3,5];

				// var result = [];
				// var current = start.clone();

				// _.each(day, (d) => {
				// 	console.log(d)
				// 	var current = start.clone();
				// 	while (current.day(7 + d).isBefore(end)) {
				// 		console.log('***')
				// 		result.push(current.clone());
				// 		// _.has(resObj, v) === false ? resObj[v] = o : ''
				// 	}
				// })

				// console.log(result.map(m => m.format('DD-MM-YYYY')));
				// return false
				// let from = data.from_date
				// let to = data.to_date
				// console.log(JSON.stringify(Moment.range(moment(`${data.from_date}`), moment(`${data.to_date}`))))
				// return false
				_.each(combos, (o) => {

					let one = Moment.range(moment(`${data.from_date}T00:00:00.0000Z`), moment(`${data.to_date}T23:59:59.999Z`))
	
					let two = Moment.range(moment(`${o.start_date}T00:00:00.0000Z`), moment(`${o.end_date}T23:59:59.999Z`))
	
					let three = one.intersect(two)
	
					let four = three != null ? three.snapTo('day') : ''
	
					let five = three != null ? Array.from(three.by('days')) : ''
					// three != null ? five.map(m => m.format('DD-MM')) : ''
	
					// console.log('=========================================')
					// // console.log(typeof o.start_date)
					// // console.log(typeof data.from_date)
					// console.log(data.from_date, data.to_date)
					// console.log(JSON.parse(JSON.stringify(one)))
					// console.log(JSON.parse(JSON.stringify(two)))
					// console.log(JSON.parse(JSON.stringify(three)))
					// console.log(JSON.parse(JSON.stringify(five)))
					// console.log(five.length)
					// console.log(o.id)
					// return false
	
					// let rangeFromTo = _.range(parseInt(moment(data.from_date).format('DD')), parseInt(moment(data.to_date).format('DD')) + 1)
	
					// let rangeStartEnd = _.range(parseInt(moment(o.start_date).format('DD')), parseInt(moment(o.end_date).format('DD')) + 1)
	
					// let differenceRange = _.intersection(rangeFromTo, rangeStartEnd)
					
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
								// console.log(now.format('YYYY-MM-DD'));
								if (v === moment(now).format('DD-MM-YYYY') && day.includes(moment(now,'YYYY-MM-DD').day())) {
									_.has(resObj, v) === false ? resObj[v] = o : ''
								}
								now.add(1, 'days');
							}

							// _.each(day, (d) => {
								// var current = start.clone();
								// while (current.day(7 + parseInt(d)).isBefore(end)) {
								// 	if (v === moment(current).format('DD-MM-YYYY')) {
								// 		_.has(resObj, v) === false ? resObj[v] = o : ''
								// 	}
								// }

								// while (current.isBefore(end) || current.isSame(end)) {
								// 	if (v === moment(current).format('DD-MM-YYYY')) {
								// 		_.has(resObj, v) === false ? resObj[v] = o : ''
								// 	}
								// }

								// dates.map(function(date){
								// 	if (required_days.includes(moment(date,'YYYY-MM-DD').day())){
								// 	 datesArr.push(date)
								// 	};
								//  })
							// })

						} else if (o.repeat_every === 2) {
							
								_.has(resObj, v) === false ? resObj[v] = o : ''
							
						}
					})
				})
				// return false

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
	
				// res.send(setRes(resCode.OK, (arrRes == '' ? resObj : arrRes), false, "available combos."))
				const offer_dates = Object.keys(resObj);
				
				for(const offer of offer_dates ){
					var image = resObj[offer].dataValues.images;
					
					var images = image.split(";");
					
					var image_array = [];
					for(const data of images){
					  	const signurl = awsConfig.getSignUrl(data);
					  	image_array.push(signurl);
					}
					resObj[offer].dataValues.images_url= image_array;
						
				}

				// console.log(resObj);
				res.send(setRes(resCode.OK, (data.limit ? arrRes : resObj) , false, "available combos."))
			})
			.catch(error => {
				console.log('============get combo error==========')
				console.log(error.message)
				res.send(setRes(resCode.InternalServer, null, true, "Internal server error"))
			})

		}).catch(error => {
			console.log(error.message + ' ...calendar.controller');
			res.send(setRes(resCode.InternalServer, null, true, 'Internal server error.'))
		})

	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}

}

exports.UpdateComboOffer = async (req, res) => {

	var data = req.body

	var comboModel = models.combo_calendar
	
	var requiredFields = _.reject(['id'], (o) => { return _.has(data, o)  })

	data.repeat_every == 1 ? (data.repeat_on ? '' : requiredFields.push('repeat_on')) : '';

	_.contains([1,2], parseInt(data.repeat_every)) ? data.repeat = true : '';

 	if (requiredFields == ''){
 		const row = await comboModel.findByPk(data.id);
		const image = row.images;
		if(req.files){
			const filesData = req.files;
			const total_image = image.length + filesData.length;
			var validation = true

			if(total_image > 5){
				validation = false
				res.send(setRes(resCode.BadRequest, null, true, "You cannot update more than 5 images.You already uploaded "+image.length+" images"))
			}
			for(const imageFile of filesData){
					const fileContent = await fs.promises.readFile(imageFile.path);
					const fileExt = `${imageFile.originalname}`.split('.').pop();
					if(imageFile.size > commonConfig.maxFileSize){
						validation = false;
						res.send(setRes(resCode.BadRequest, null, true, 'You can upload only 5 mb files, some file size is too large'))
					}else if (!commonConfig.allowedExtensions.includes(fileExt)) {
					  // the file extension is not allowed
					  validation = false;
					  res.send(setRes(resCode.BadRequest, null, true, 'You can upload only jpg, jpeg, png, gif files'))
					}
			}

			if(validation){
				
				var files = [];
				for(const file of filesData){
					const fileContent = await fs.promises.readFile(file.path);
					const fileExt = `${file.originalname}`.split('.').pop()
					const randomString = Math.floor(Math.random() * 1000000); 
					const fileName = `${Date.now()}_${randomString}.${fileExt}`;
					const params = {
				       Bucket: awsConfig.Bucket,
				       Key: `combos/${data.id}/${fileName}`,
				       Body: fileContent,
		     		};

	     			const result = await awsConfig.s3.upload(params).promise();
				  	if(result){
						files.push(`combos/${data.id}/${fileName}`)
						fs.unlinkSync(file.path)
					}
				}
				var images = files.join(';');
				
				const oldFilenames = image.join(';');
				
				
				if(images != ""){
					const allFilenames = `${oldFilenames};${images}`;
					data.images = allFilenames
				}
			}
		}

		comboModel.findOne({
			where: {
				id: data.id,
				is_deleted: false
			}
		}).then(comboOffer => {
			if (comboOffer) {


				comboModel.update(data, {
					where: {
						id: data.id,
						is_deleted: false
					}
				}).then(updatedOffers => {
					if (updatedOffers > 0){
						
						comboModel.findOne({
							where: {
								id: data.id,
								is_deleted: false
							}
						}).then(combo => {
							var combo_images = combo.images
							var image_array = [];
							for(const data of combo_images){
								const signurl = awsConfig.getSignUrl(data);
			  					image_array.push(signurl);
							}
							combo.dataValues.combo_images = image_array
							res.send(setRes(resCode.OK, combo, false, "Combo Offer updated successfully."))
						}).catch(error => {
							console.log('===========update combo offer========')
							console.log(error.message)
							res.send(setRes(resCode.InternalServer, null, true, "Fail to update combo offer."))
						})

					}
				})

			} else {
				res.send(setRes(resCode.ResourceNotFound, null, false, "Resource not found !!"))
			}
		}).catch(error => {
			console.log(error);
		})
		

	}else{
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}

exports.removeImagesFromCombo = (req, res) => {

	var data = req.body;
	var comboModel = models.combo_calendar

	var requiredFields = _.reject(['combo_id'], (o) => { return _.has(data, o)  })
	
	if (requiredFields == ''){

		if (data.image) {

			comboModel.findOne({
				where: {
					id: data.combo_id,
					is_deleted: false
				}
			}).then(comboOffer => {

				// console.log(JSON.parse(JSON.stringify(comboOffer)))
				var replaceImages = _.filter(comboOffer.images, (img) => {
						return img != data.image
					})
				var images = replaceImages.join(';');
				comboModel.update({
					images: images
				},{
					where : {
						id: data.combo_id
					}
				}).then(updatedOffer => {
					
					if (updatedOffer > 0) {
						const params = {
						    Bucket: awsConfig.Bucket,
						    Key: data.image
						};
						awsConfig.deleteImageAWS(params)

						comboModel.findOne({
							where: {
								id: data.combo_id
							}
						}).then(combo => {
							var combo_images = combo.images
							var image_array = [];
							for(const data of combo_images){
								const signurl = awsConfig.getSignUrl(data);
			  					image_array.push(signurl);
							}
							combo.dataValues.combo_images = image_array
							res.send(setRes(resCode.OK, combo, false, "Combo offer.."))
						})
					}

				}).catch(error => {
					console.log('=======replace combo images error=========')
					console.log(error.message)
					res.send(setRes(resCode.InternalServer, null, true, "Internal server error."))
				})

			}).catch(error => {
				console.log('===========remove images from combo offer========')
				console.log(error.message)
				res.send(setRes(resCode.InternalServer, null, true, "Fail to remove image from combo offer."))
			})

		} else {
			res.send(setRes(resCode.BadRequest, null, true, "Invalid image name..."))
		}

	} else {
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}