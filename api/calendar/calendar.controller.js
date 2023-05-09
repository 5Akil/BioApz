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
const { log } = require('console')

// Create Event
exports.CreateEvent = async (req, res) => {

	var data = req.body
	var filesData = req.files;
	var comboModel = models.combo_calendar
	var Op = models.Op
	var validation = true;

	var requiredFields = _.reject(['business_id', 'title', 'description', 'end_date', 'start_date', 'location'], (o) => { return _.has(data, o) })

	// data.repeat_every == 1 ? (data.repeat_on ? '' : requiredFields.push('repeat_on')) : '';

	// _.contains([1, 2], parseInt(data.repeat_every)) ? data.repeat = true : '';

	// var repeat_on_validation = _.reject(data.repeat_on, (v) => {
	// 	return _.has([0, 1, 2, 3, 4, 5, 6], parseInt(v))
	// })

	// if (repeat_on_validation == '') {

	if (requiredFields == '') {
		// Start date save different columns logic
		var startDate = moment(data.start_date).format('DD-MM-YYYY HH:mm:ss');
		var sDate_value = startDate.split(" ");

		// End date time save different columns logic
		var endDate = moment(data.end_date).format('DD-MM-YYYY HH:mm:ss');
		var eDate_value = endDate.split(" ");

		if (filesData.length == 0) {
			res.send(setRes(resCode.BadRequest, false, 'At least one image is required for product', null))
			validation = false;
		} else if (filesData.length > 5) {
			validation = false;
			res.send(setRes(resCode.BadRequest, false, 'You can upload only 5 images', null))
		}
		if (filesData.length != 0 && filesData.length <= 5) {
			for (const image of filesData) {
				const fileContent = await fs.promises.readFile(image.path);
				const fileExt = `${image.originalname}`.split('.').pop();
				if (image.size > commonConfig.maxFileSize) {
					validation = false;
					res.send(setRes(resCode.BadRequest, false, 'You can upload only 5 mb files, some file size is too large', null))
				} else if (!commonConfig.allowedExtensions.includes(fileExt)) {
					// the file extension is not allowed
					validation = false;
					res.send(setRes(resCode.BadRequest, false, 'You can upload only jpg, jpeg, png, gif files', null))
				}
			}

		}
		if (validation) {

			var comboOffer = await createComboOffer(data)

			if (comboOffer != '') {
				const lastInsertId = comboOffer.id;
				if (lastInsertId) {

					var files = [];
					for (const file of filesData) {

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
						if (result) {
							files.push(`combos/${lastInsertId}/${fileName}`)
							fs.unlinkSync(file.path)
						}
					}
					var images = files.join(';');

					comboModel.update({
						images: images,
						start_date: sDate_value[0],
						start_time: sDate_value[1],
						end_date: eDate_value[0],
						end_time: eDate_value[1]
					}, {
						where: {
							id: lastInsertId,

						}
					}).then(async comboData => {
						if (comboData) {
							comboModel.findOne({ where: { id: lastInsertId } }).then(async getData => {
								var combo_images = getData.images
								var image_array = [];
								for (const data of combo_images) {
									const signurl = await awsConfig.getSignUrl(data).then(function (res) {
										image_array.push(res);
									});
								}
								getData.dataValues.combo_images = image_array

								res.send(setRes(resCode.OK, true, "Event created successfully", getData))
							})
						} else {
							res.send(setRes(resCode.InternalServer, getData, null, "Image not update"))
						}
					})
				}

			}
			else {
				res.send(setRes(resCode.BadRequest, false, "Fail to create event.", null))
			}
		}

	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}

	// } else {
	// 	res.send(setRes(resCode.BadRequest, false, "repeat_on value must between 0-6...", null))
	// }
}

// Remove Single image from event
exports.removeImagesFromCombo = (req, res) => {

	var data = req.body;
	var comboModel = models.combo_calendar

	var requiredFields = _.reject(['combo_id'], (o) => { return _.has(data, o) })

	if (requiredFields == '') {

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
				}, {
					where: {
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
						}).then(async combo => {
							var combo_images = combo.images
							var image_array = [];
							for (const data of combo_images) {
								const signurl = await awsConfig.getSignUrl(data).then(function (res) {
									image_array.push(res);
								});
							}
							combo.dataValues.combo_images = image_array
							res.send(setRes(resCode.OK, true, "Image remove successfully", combo))
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
			res.send(setRes(resCode.BadRequest, null, true, "Please Select image first..."))
		}

	} else {
		res.send(setRes(resCode.BadRequest, null, true, (requiredFields.toString() + ' are required')))
	}
}

// Delete event
exports.DeleteEvent = async (req, res) => {
	var data = req.params
	var comboModel = models.combo_calendar
	var businessModel = models.business
	var Op = models.Op;
	if (data.id) {
		comboModel.findOne({
			where: {
				id: data.id,
				is_deleted: false
			}
		}).then(eventData => {
			if (eventData) {
				eventData.update({ is_deleted: true })
				res.send(setRes(resCode.OK, true, "Event deleted successfully", null))
			} else {
				res.send(setRes(resCode.ResourceNotFound, false, "Event not found", null))
			}
		}).catch(error => {
			res.send(setRes(resCode.BadRequest, false, "Internal server error.", null))
		})
	} else {
		res.send(setRes.BadRequest, false, "id is required", null)
	}
}

// Get All Events
exports.GetAllEvents = async (req, res) => {
	var resObj = {}
	var data = req.body
	var comboModel = models.combo_calendar
	var Op = models.Op

	var requiredFields = _.reject(['business_id'], (o) => { return _.has(data, o) })
	if (requiredFields == '') {
		comboModel.update({
			is_deleted: true
		}, {
			where: {
				is_deleted: false,
				end_date: {
					[Op.lt]: moment().format('YYYY-MM-DD')
				}
			}
		}).then(async updatedOffers => {
		 	await comboModel.findAll({
				where: {
					business_id: data.business_id,
					is_deleted: false,
				},
				order: [
					['createdAt', 'DESC']
				],
				subQuery: false
			}).then(async combos => {
				await _.each(combos, (o) => {
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
								day = o.repeat_on.map(function (v) {
									return parseInt(v);
								});
							var now = start;
							while (now.isBefore(end) || now.isSame(end)) {
								if (v === moment(now).format('DD-MM-YYYY') && day.includes(moment(now, 'YYYY-MM-DD').day())) {
									_.has(resObj, v) === false ? resObj[v] = o : ''
								}
								now.add(1, 'days');
							}
						} else if (o.repeat_every === 2) {
							_.has(resObj, v) === false ? resObj[v] = o : ''
						}
					})
				})
				console.log(resObj)
				// get N element from object
				let arrRes = []
				if (data.limit && data.limit > 0) {
					function firstN(obj, n) {
						return _.chain(obj)
							.keys()
							.sort()
							.take(n)
							.reduce(function (memo, current) {
								arrRes.push(obj[current]);
								return memo;
							}, {})
							.value();
					}

					firstN(resObj, data.limit)
				}
				const offer_dates = Object.keys(resObj);

				for (const offer of offer_dates) {
					var image = resObj[offer].dataValues.images;
					var images = image.split(";");
					var image_array = [];
					for (const data of images) {
						const signurl = await awsConfig.getSignUrl(data).then(function (res) {
							image_array.push(res);
						});
					}
					resObj[offer].dataValues.images_url = image_array;
				}
				console.log(arrRes)
				res.send(setRes(resCode.OK, true, "Available events list.", (data.limit ? arrRes : resObj)))
			})
				.catch(error => {
					console.log('============get combo error==========')
					console.log(error.message)
					res.send(setRes(resCode.InternalServer, false, "Internal server error", null))
				})
		}).catch(error => {
			console.log(error.message + ' ...calendar.controller');
			res.send(setRes(resCode.InternalServer, false, 'Internal server error.', null))
		})
	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}
}

// View Event
exports.ViewEvent = async (req, res) => {
	data = req.params;
	var comboModel = models.combo_calendar
	var userEventsModel = models.user_events
	var usersModel = models.user

	comboModel.findOne({
		where: {
			id: data.id,
			is_deleted: false
		}
	}).then(async event => {
		if (event != null) {
			var event_images = event.images
			var image_array = [];
			var event_users = [];
			if (event_images != null) {
				for (const data of event_images) {
					const signurl = await awsConfig.getSignUrl(data).then(function (res) {
						image_array.push(res);
					});
				}
			} else {
				image_array.push(commonConfig.default_image)
			}
			await userEventsModel.findAll({
				where: {
					event_id: event.id,
					is_deleted: false
				},
				include: [
					{
						model: usersModel,
						as: 'users'
					},
				],
			}).then(async eventUsers => {
				await _.each(eventUsers, function (itm) {
					// var profile_image = awsConfig.getSignUrl(itm.users.dataValues.profile_picture)
					this.push(_.pick(itm.users.dataValues, ["id","username","profile_picture"])) 
					}, event_users);
			})
			event = JSON.parse(JSON.stringify(event));
			event.users = event_users;
			res.send(setRes(resCode.OK, true, "Get event detail successfully.", event))
		} else {
			res.send(setRes(resCode.ResourceNotFound, false, "Event not found.", null))
		}

	}).catch(error => {
		res.send(setRes(resCode.InternalServer, error, "Internal server error.", null))
	})
}

// update Event
exports.UpdateEvent = async (req, res) => {

	var data = req.body
	var comboModel = models.combo_calendar
	var requiredFields = _.reject(['id','title', 'description', 'end_date', 'start_date', 'location'], (o) => { return _.has(data, o) })

	// data.repeat_every == 1 ? (data.repeat_on ? '' : requiredFields.push('repeat_on')) : '';
	// _.contains([1, 2], parseInt(data.repeat_every)) ? data.repeat = true : '';
	var row = await comboModel.findByPk(data.id);
	// Start date save different columns logic
	var startDate = moment(data.start_date).format('YYYY-MM-DD HH:mm:ss');
	var sDate_value = startDate.split(" ");

	// End date time save different columns logic
	var endDate = moment(data.end_date).format('YYYY-MM-DD HH:mm:ss');
	var eDate_value = endDate.split(" ");
	if (data.id != null) {
		if(requiredFields == ''){
			var image = row.images;
			if (req.files) {
				const filesData = req.files;
				const total_image = image.length + filesData.length;
				var validation = true

				if (total_image > 5) {
					validation = false
					res.send(setRes(resCode.BadRequest, false, "You cannot update more than 5 images.You already uploaded " + image.length + " images", null))
				}
				for (const imageFile of filesData) {
					const fileContent = await fs.promises.readFile(imageFile.path);
					const fileExt = `${imageFile.originalname}`.split('.').pop();
					if (imageFile.size > commonConfig.maxFileSize) {
						validation = false;
						res.send(setRes(resCode.BadRequest, false, 'You can upload only 5 mb files, some file size is too large', null))
					} else if (!commonConfig.allowedExtensions.includes(fileExt)) {
						// the file extension is not allowed
						validation = false;
						res.send(setRes(resCode.BadRequest, false, 'You can upload only jpg, jpeg, png, gif files', null))
					}
				}

				if (validation) {

					var files = [];
					for (const file of filesData) {
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
						if (result) {
							files.push(`combos/${data.id}/${fileName}`)
							fs.unlinkSync(file.path)
						}
					}
					var images = files.join(';');

					const oldFilenames = image.join(';');


					if (images != "") {
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
			}).then(async event => {
				if (event) {
					comboModel.update(data, {
						where: {
							id: data.id,
							is_deleted: false
						}
					}).then(updatedOffers => {
						if (updatedOffers > 0) {

							comboModel.findOne({
								where: {
									id: data.id,
									is_deleted: false
								}
							}).then(async comboData => {
								comboModel.update({
									start_date : sDate_value[0],
									start_time : sDate_value[1],
									end_date : eDate_value[0],
									end_time : eDate_value[1],
								},{
									where:{
										id: data.id,
										is_deleted: false
									}
								}).then(async comboValue =>{
									comboModel.findOne({
										where: {
											id: data.id,
											is_deleted: false
										}
									}).then(async combo => {
										var combo_images = combo.images
										var image_array = [];
										for (const data of combo_images) {
											const signurl = await awsConfig.getSignUrl(data).then(function (res) {

												image_array.push(res);
											});
										}
										combo.dataValues.combo_images = image_array
										
										res.send(setRes(resCode.OK, true, "Event updated successfully.", combo))
									})
								})
							}).catch(error => {
								console.log(error.message)
								res.send(setRes(resCode.InternalServer, false, "Fail to update event.", null))
							})

						}
					})
				} else {
					res.send(setRes(resCode.ResourceNotFound, false, "Event not found.", null))
				}
			}).catch(error => {
				res.send(setRes(resCode.InternalServer, false, "Internal server error.", null))
			})
		}else{
			res.send(setRes(resCode.BadRequest,false, (requiredFields.toString() + ' are required'),null))
		}
	} else {
		res.send(setRes(resCode.BadRequest, null, true, ('id is required')))
	}
}

// Combo offer message
function createComboOffer(data) {
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