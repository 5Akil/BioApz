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
	var businessModel = models.business
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
		var startDate = moment(data.start_date).format('YYYY-MM-DD HH:mm:ss');
		var sDate_value = startDate.split(" ");

		// End date time save different columns logic
		var endDate = moment(data.end_date).format('YYYY-MM-DD HH:mm:ss');
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

		const conditionExistingEvent = {};
		conditionExistingEvent.where = {business_id: data.business_id,is_deleted: false,}
		conditionExistingEvent.attributes = { exclude: ['createdAt','updatedAt','is_deleted','repeat','repeat_every','repeat_on']}

		if(!_.isEmpty(data.start_date) && !_.isEmpty(data.end_date)){
			conditionExistingEvent.where = {
				...conditionExistingEvent.where,
				// Conditions on start date time and end date time to find slot is available or not
				...{
					[Op.or] : [
						{
							[Op.and] : [
								{
									[Op.or] : [
										{
											start_date: {
												[Op.lt] : sDate_value[0]
											},
										},
										{
											start_date: {
												[Op.lte] : sDate_value[0]
											},
											start_time: {
												[Op.lte] : sDate_value[1]
											},
										}
									]
								},
								{
									[Op.or] : [
										{
											end_date: {
												[Op.gt] : sDate_value[0]
											}
										},
										{
											end_date: {
												[Op.gte] : sDate_value[0]
											},
											end_time: {
												[Op.gte] : sDate_value[1]
											},
										}
									]
								}
							]
						},
						{
							[Op.and] : [
								{
									[Op.or] : [
										{
											start_date: {
												[Op.lt] : eDate_value[0]
											},
										},
										{
											start_date: {
												[Op.lte] : eDate_value[0]
											},
											start_time: {
												[Op.lte] : eDate_value[1]
											},
										}
									]
								},
								{
									[Op.or] : [
										{
											end_date: {
												[Op.gt] : eDate_value[0]
											},
										},
										{
											end_date: {
												[Op.gte] : eDate_value[0]
											},
											end_time: {
												[Op.gte] : eDate_value[1]
											},
										}
									]
								}
							]
						}
					],					
				}
			}
		}

		// Check if Event already exists for business in provided time span
		const events = await comboModel.findAll(conditionExistingEvent);

		if (events && events?.length > 0) {
			validation =  false;
			res.send(setRes(resCode.BadRequest, false, "Event exists in between same time slot.", null))
		}
				
		if (validation) {
			businessModel.findOne({
				where: {id: data.business_id,is_deleted: false,is_active:true}
			}).then(async business => {
				if(business){
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
									res.send(setRes(resCode.BadRequest, false, null, "Image not update"))
								}
							})
						}

					}
					else {
						res.send(setRes(resCode.BadRequest, false, "Fail to create event.", null))
					}
				}else{
					res.send(setRes(resCode.ResourceNotFound, false, "Business not found.", null))
				}
			})
		}

	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}

	// } else {
	// 	res.send(setRes(resCode.BadRequest, false, "repeat_on value must between 0-6...", null))
	// }
}

// Remove Single image from event
exports.removeImagesFromCombo = async (req, res) => {

	var data = req.body;
	var comboModel = models.combo_calendar

	var requiredFields = _.reject(['combo_id'], (o) => { return _.has(data, o) })

	if (requiredFields == '') {

		if (data.image_name) {

			await comboModel.findOne({
				where: {
					id: data.combo_id,
					is_deleted: false
				}
			}).then(async comboOffer => {

				if(comboOffer){
					var replaceImages = await _.filter(comboOffer.images, (img) => {
						var typeArr = data.image_name;
						 if(!typeArr.includes(img)){
							return img;
						 }
						 return ''
					})

					var new_images = replaceImages.join(';')
					var productremoveimages = data.image_name;
					for(const data of productremoveimages){
						const params = {
							Bucket: awsConfig.Bucket,
							Key: data
						};
						awsConfig.deleteImageAWS(params)
					}

					await comboModel.update({
						images: new_images
					}, {
						where: {
							id: data.combo_id
						}
					}).then(async updatedOffer => {

						if (updatedOffer > 0) {

							await comboModel.findOne({
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
						res.send(setRes(resCode.InternalServer, null, false, "Internal server error."))
					})
				}else{
					res.send(setRes(resCode.ResourceNotFound, false, "Event not found.", null))
				}

			}).catch(error => {
				res.send(setRes(resCode.InternalServer, null, false, "Fail to remove image from combo offer."))
			})

		} else {
			res.send(setRes(resCode.BadRequest, null, false, "Please Select image first..."))
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
	var eventUserModel = models.user_events
	var currentDate = (moment().subtract(7, "days").format('YYYY-MM-DD'));

	if (data.id) {
		await comboModel.findOne({
			where: {
				id: data.id,
				is_deleted: false
			}
		}).then(async eventData => {
			const eventDate = moment(eventData.start_date).format('YYYY-MM-DD');
			if(currentDate == eventDate){
				res.send(setRes(resCode.BadRequest, false, "can't delete event because.", null))
			}else{
				await eventUserModel.findAll({
					where: { event_id: data.id, is_deleted: false, is_available: true }
				}).then(async eventUsers => {
					if(eventUsers.length == 0){
						if (eventData) {
							await eventData.update({ is_deleted: true,status:4 })
							res.send(setRes(resCode.OK, true, "Event deleted successfully", null))
						} else {
							res.send(setRes(resCode.ResourceNotFound, false, "Event not found", null))
						}
					}else{
						res.send(setRes(resCode.BadRequest, false, "can't delete event because some users registered or active.", null))
					}
				})
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

	var requiredFields = _.reject(['page','page_size','business_id'], (o) => { return _.has(data, o) })
	if (requiredFields == '') {

		if(data.page < 0 || data.page === 0) {
			res.send(setRes(resCode.BadRequest, null, false, "invalid page number, should start with 1"))
		}
		var skip = data.page_size * (data.page - 1)
		var limit = parseInt(data.page_size)

		var condition2 = {
			subQuery:false,
			order: [
				['createdAt', 'DESC']
			],
		}
		condition2.where = {business_id: data.business_id,is_deleted: false,}
		condition2.attributes = { exclude: ['createdAt','updatedAt','is_deleted','repeat','repeat_every','repeat_on']}

		var startDate = (moment(data.from_date).format('YYYY-MM-DD'))
		var endDate = (moment(data.to_date).format('YYYY-MM-DD'))

		if(!_.isEmpty(data.from_date) && !_.isEmpty(data.to_date)){
			condition2.where = {...condition2.where,...{start_date: {[Op.between]: [startDate, endDate]}}}
		}

		var totalRecords = null

		comboModel.findAll(condition2).then(async(eventList) => {
			totalRecords = eventList.length
		})

		// comboModel.update({
		// 	is_deleted: true
		// }, {
		// 	where: {
		// 		is_deleted: false,
		// 		end_date: {
		// 			[Op.lt]: moment().format('YYYY-MM-DD')
		// 		}
		// 	}
			var condition = {
				offset:skip,
				limit:limit,
				subQuery:false,
				order: [
					['createdAt', 'DESC']
				],
			}
			condition.where = {business_id: data.business_id,is_deleted: false,}
			condition.attributes = { exclude: ['createdAt','updatedAt','is_deleted','repeat','repeat_every','repeat_on']}

			if(!_.isEmpty(data.from_date) && !_.isEmpty(data.to_date)){
					condition.where = {...condition.where,...{start_date: {[Op.between]: [startDate, endDate]}}}
			}

		 	await comboModel.findAll(condition).then(async combos => {
				if(combos.length > 0){
					for (const data of combos) {
						var event_images = data.images
						var image_array = [];
						if(event_images != null){
							for(const data of event_images){
								const signurl = await awsConfig.getSignUrl(data).then(function(res){
									  image_array.push(res);
								});
							}
						}else{
							image_array.push(commonConfig.default_image)
						}
						data.dataValues.event_images = image_array
					}
				}

				const previous_page = (data.page - 1);
				const last_page = Math.ceil(totalRecords / data.page_size);
				var next_page = null;
				if(last_page > data.page){
					var pageNumber = data.page;
					pageNumber++;
					next_page = pageNumber;
				}
				
				var response = {};
				response.totalPages = Math.ceil(combos.length/limit);
				response.currentPage = parseInt(data.page);
				response.per_page = parseInt(data.page_size);
				response.total_records = totalRecords;
				response.data = combos;
				response.previousPage = previous_page;
				response.nextPage = next_page;
				response.lastPage = last_page;
				res.send(setRes(resCode.OK, true, "Available events list.", response))
		}).catch(error => {
			res.send(setRes(resCode.InternalServer, false, 'Internal server error.', null))
		})
	} else {
		res.send(setRes(resCode.BadRequest, false, (requiredFields.toString() + ' are required'), null))
	}
}

// View Event
exports.ViewEvent = async (req, res) => {
	var data = req.params;
	var val = req.query
	var comboModel = models.combo_calendar
	var userEventsModel = models.user_events
	var usersModel = models.user

	comboModel.findOne({
		where: {
			id: data.id,
			business_id:val.business_id,
			is_deleted: false
		},
		attributes: {exclude: ['createdAt','updatedAt','is_deleted','repeat','repeat_every','repeat_on']}
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
			event.dataValues.event_images = image_array
			await userEventsModel.findAll({
				where: {
					event_id: event.id,
					is_deleted: false,
					is_available:true
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
					for (const data of event_users) {
						if(data.profile_picture != null){
							const signurl = await awsConfig.getSignUrl(data.profile_picture).then(function (res) {
								data.profile_picture = res
							});
						}else{
							data.profile_picture = commonConfig.default_user_image;
						}
					}
			})
			event = JSON.parse(JSON.stringify(event));
			event.users = event_users;
			res.send(setRes(resCode.OK, true, "Get event detail successfully.", event))
		} else {
			res.send(setRes(resCode.ResourceNotFound, false, "Event not found.", null))
		}

	}).catch(error => {
		res.send(setRes(resCode.InternalServer, false, "Internal server error.", null))
	})
}

// update Event
exports.UpdateEvent = async (req, res) => {

	var data = req.body
	var comboModel = models.combo_calendar
	const businessModel = models.business
	var requiredFields = _.reject(['id','title', 'description', 'end_date', 'start_date', 'location'], (o) => { return _.has(data, o) })

	// data.repeat_every == 1 ? (data.repeat_on ? '' : requiredFields.push('repeat_on')) : '';
	// _.contains([1, 2], parseInt(data.repeat_every)) ? data.repeat = true : '';
	var row = await comboModel.findByPk(data.id);
	const Op = models.Op
	// Start date save different columns logic
	var startDate = moment(data.start_date).format('YYYY-MM-DD HH:mm:ss');
	var sDate_value = startDate.split(" ");

	// End date time save different columns logic
	
	// const userEmail = req.userEmail;
	// const businessUser = await businessModel.findOne({ where: { email: userEmail } });
	// if (!businessUser) {
	// 	return res.send(setRes(resCode.ResourceNotFound, false, "Business user not found.", null))
	// }
	var endDate = moment(data.end_date).format('YYYY-MM-DD HH:mm:ss');
	var eDate_value = endDate.split(" ");
	if (data.id != null) {
		if(requiredFields.length == 0){
			const isEventExists = await comboModel.findOne({ where: { id: data.id,is_deleted: false } })
			if (!isEventExists) {
				return res.send(setRes(resCode.ResourceNotFound, false, "Event not found.", null))
			}
			var image = row?.images || [];
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

				const conditionExistingEvent = {};
				conditionExistingEvent.where = { id: { [Op.not]: data.id }, is_deleted: false,}
				conditionExistingEvent.attributes = { exclude: ['createdAt','updatedAt','is_deleted','repeat','repeat_every','repeat_on']}

				if(!_.isEmpty(data.start_date) && !_.isEmpty(data.end_date)){
					conditionExistingEvent.where = {
						...conditionExistingEvent.where,
						// Conditions on start date time and end date time to find slot is available or not
						...{
							[Op.or] : [
								{
									[Op.and] : [
										{
											[Op.or] : [
												{
													start_date: {
														[Op.lt] : sDate_value[0]
													},
												},
												{
													start_date: {
														[Op.lte] : sDate_value[0]
													},
													start_time: {
														[Op.lte] : sDate_value[1]
													},
												}
											]
										},
										{
											[Op.or] : [
												{
													end_date: {
														[Op.gt] : sDate_value[0]
													}
												},
												{
													end_date: {
														[Op.gte] : sDate_value[0]
													},
													end_time: {
														[Op.gte] : sDate_value[1]
													},
												}
											]
										}
									]
								},
								{
									[Op.and] : [
										{
											[Op.or] : [
												{
													start_date: {
														[Op.lt] : eDate_value[0]
													},
												},
												{
													start_date: {
														[Op.lte] : eDate_value[0]
													},
													start_time: {
														[Op.lte] : eDate_value[1]
													},
												}
											]
										},
										{
											[Op.or] : [
												{
													end_date: {
														[Op.gt] : eDate_value[0]
													},
												},
												{
													end_date: {
														[Op.gte] : eDate_value[0]
													},
													end_time: {
														[Op.gte] : eDate_value[1]
													},
												}
											]
										}
									]
								}
							],					
						}
					}
				}

				// Check if Event already exists for business in provided time span
				const events = await comboModel.findAll(conditionExistingEvent);

				if (events && events?.length > 0) {
					validation = false;
					return res.send(setRes(resCode.BadRequest, false, "Event exists in between same time slot.", events))
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

