
const models = require("../../models");
const _ = require("underscore");
const setRes = require("../../response");
const resCode = require("../../config/res_code_config");
var pdf = require("pdf-creator-node");
const fs = require('fs');
const path = require("path");
const awsConfig = require('../../config/aws_S3_config');
const moment = require("moment");


// exports. generateInvoice = async (req, res) => {

//     try {
//         const data = req.body;
//         const user = req.user;
//         const orderModel = models.orders;
//         const businessaModel = models.business;
//         const userModel = models.user;
//         const productModel = models.products
//         const orderDetailModel = models.order_details;
//         const requiredFields = _.reject(["order_id"], (o) => {
//             return _.has(data, o);
//         });
//         if (requiredFields == "") {

//             const existOrder = await orderModel.findOne({
//                 where: {
//                     id: data.order_id,
//                     user_id: user.id,
//                     is_deleted: false,
//                 },
//                 include: [
//                     {
//                         model: orderDetailModel,
//                         include: [
//                             {
//                                 model: productModel,
//                                 attributes: ['name', 'price', 'description']
//                             }],
//                         attributes: ['price', 'qty', 'discount_price']
//                     },
//                     {
//                         model: businessaModel,
//                         attributes: ['business_name', 'address', 'country_id']
//                     },
//                     {
//                         model: userModel,
//                         attributes: ['username', 'email', 'address', 'country_id']
//                     }
//                 ],
//                 attributes: ['order_no', 'amount', 'payment_id', 'createdAt', 'id', 'invoice_path' ,'is_pickup' ,'pickup_time']
//             })
//             if (_.isNull(existOrder)) {
//                 return res.send(setRes(resCode.BadRequest, false, 'Order not Found', null))
//             }
//             let total_discount = 0;
//             let product_total = 0
//             for (const data of existOrder.order_details) {
//                 data.dataValues.name = data?.product?.name;
//                 data.dataValues.price = data?.product?.price;
//                 data.dataValues.productTotal = parseFloat(data?.product?.price * data?.qty).toFixed(2)
//                 data.dataValues.description = data?.product?.description
//                 data.dataValues.price ? (product_total += parseFloat(data.dataValues.price)) : null
//                 data.dataValues.discount_price ? (total_discount += Number(data.dataValues.discount_price)) : null
//                 delete data.dataValues.product
//             }
//             const d = new Date();
//             existOrder.dataValues.invoice_no = `${d.getTime()}` + existOrder.dataValues.id
//             existOrder.dataValues.order_date = moment(existOrder.createdAt).format("DD/MM/YYYY")
//             existOrder.dataValues.grand_total = existOrder.dataValues.amount;
//             existOrder.dataValues.discount_total = parseFloat(total_discount).toFixed(2)
//             existOrder.dataValues.product_total = parseFloat(product_total).toFixed(2)
//             delete existOrder.dataValues.amount
//             delete existOrder.dataValues.createdAt
//             console.log(existOrder,'<<<<<<,');
//             if (existOrder && existOrder.invoice_path == null) {
//                 const templatePath = path.join(
//                     __dirname,
//                     "../../",
//                     "template",
//                     "invoice.html"
//                 );
//                 const templateContent = fs.readFileSync(templatePath, 'utf-8');
//                 var document = {
//                     html: templateContent,
//                     data: {
//                         data: existOrder.dataValues
//                     },
//                     // type: 'stream',
//                     path:'output.pdf'
//                 };
//                 var options = {
//                     format: "A3",
//                     orientation: "portrait",
//                     border: "10mm",

//                 };
//                 //convert HTML template to pdf
//                 pdf.create(document, options).then((response) => {
//                     console.log(response);
//                     // const fileName = `Invoice_${existOrder.order_no}.pdf`
//                     // // Upload the generated PDF to S3
//                     // const uploadParams = {
//                     //     Bucket: awsConfig.Bucket,
//                     //     Key: 'invoices/' + fileName,
//                     //     Body: response,
//                     //     contentType: 'application/pdf'
//                     // };
//                     // awsConfig.s3.upload(uploadParams, function (err, result) {
//                     //     if (err) {
//                     //         console.error("Error uploading to S3:", err);
//                     //     } else {
//                     //         orderModel.update({ invoice_no: existOrder.dataValues.invoice_no, invoice_path: result.Location },
//                     //             {
//                     //                 where: {
//                     //                     id: data.order_id,
//                     //                     user_id: user.id,
//                     //                     is_deleted: false
//                     //                 }
//                     //             }).then((updateData) => {
//                     //                 if (updateData) {
//                     //                     return res.send(setRes(resCode.OK, true, "Invoice generated successfully for this order", result.Location))
//                     //                 }
//                     //             })
//                     //     }
//                     // });
//                 })
//                     .catch((error) => {
//                         console.error(error);
//                         return res.send(setRes(resCode.BadRequest ,false , "Can not Generate Invoice" , null))
//                     });
//             } else {
//                 return res.send(setRes(resCode.OK, true, "Invoice generated successfully for this order", existOrder.invoice_path))
//             }
//         } else {
//             return res.send(
//                 setRes(
//                     resCode.BadRequest,
//                     false,
//                     requiredFields.toString() + " are required",
//                     null
//                 )
//             );
//         }
//     } catch (error) {
//         console.log(error);
//     }

// }

exports.generateInvoice = async (req, res) => {

	try {
		const data = req.body;
		const user = req.user;
		const orderModel = models.orders;
		const businessaModel = models.business;
		const userModel = models.user;
		const productModel = models.products
		const orderDetailModel = models.order_details;
		const rewardHistoryModel = models.reward_history
		const requiredFields = _.reject(["order_id"], (o) => {
			return _.has(data, o);
		});
		if (requiredFields == "") {

			const existOrder = await orderModel.findOne({
				where: {
					id: data.order_id,
					//user_id: user.id,
					is_deleted: false,
				},
				include: [
					{
						model: orderDetailModel,
						include: [
							{
								model: productModel,
								attributes: ['name', 'price', 'description']
							}],
					},
					{
						model: businessaModel,
						attributes: ['business_name', 'address', 'country_id']
					},
					{
						model: userModel,
						attributes: ['username', 'email', 'address', 'country_id']
					}
				],
			})
			if (_.isNull(existOrder)) {
				return res.send(setRes(resCode.BadRequest, false, 'Order not Found', null))
			}
			let product_total = 0
			const totalUsedCashbacks = await rewardHistoryModel.findAll({
				where: {
					order_id: data.order_id,
					reference_reward_type: 'cashbacks',
					credit_debit: false
				},
			});

			var tUsedcashback = 0.00;
			if (!_.isEmpty(totalUsedCashbacks)) {
				for (const amount of totalUsedCashbacks) {
					tUsedcashback += parseFloat(amount.amount)
				}
			}
			const totalUsedLoyalty = await rewardHistoryModel.findAll({
				where: {
					order_id: data.order_id,
					reference_reward_type: 'loyalty_points',
					credit_debit: false
				},
			});
			var tUsedLoyalty = 0.00;
			if (!_.isEmpty(totalUsedLoyalty)) {
				for (const amount of totalUsedLoyalty) {
					tUsedLoyalty += parseFloat(amount.amount)
				}
			}
			var loyaltyValue = parseFloat(tUsedLoyalty) * 0.01;
			for (const data of existOrder.order_details) {
				data.dataValues.name = data?.product?.name;
				data.dataValues.price = data?.product?.price;
				data.dataValues.productTotal = parseFloat(data?.product?.price * data?.qty).toFixed(2)
				data.dataValues.description = data?.product?.description
				data.dataValues.price ? (product_total += Number(data.dataValues.price)) : null
				delete data.dataValues.product
			}

			const d = new Date();
			existOrder.dataValues.invoice_no = `${d.getTime()}` + existOrder.dataValues.id
			existOrder.dataValues.order_date = moment(existOrder.createdAt).format("DD/MM/YYYY")
			existOrder.dataValues.grand_total = existOrder.dataValues.amount;
			existOrder.dataValues.discount_total = parseFloat(Number(existOrder.dataValues.total_discounts) + Number(existOrder.dataValues.coupon_discount_amount)).toFixed(2)
			existOrder.dataValues.cashback_total = parseFloat(tUsedcashback).toFixed(2)
			existOrder.dataValues.loyalty_points_total = parseFloat(tUsedLoyalty).toFixed(2)
			existOrder.dataValues.loyaltyValue = parseFloat(loyaltyValue).toFixed(2)
			existOrder.dataValues.product_total = parseFloat(product_total).toFixed(2)
			existOrder.dataValues.virtual_card_amount = existOrder.dataValues.giftcard_used_amount > 0 || existOrder.dataValues.giftcard_used_amount !== null ? existOrder.dataValues.giftcard_used_amount : "0.00"
			delete existOrder.dataValues.amount
			delete existOrder.dataValues.createdAt

			if (existOrder && existOrder.invoice_path == null) {
				const templatePath = path.join(
					__dirname,
					"../../",
					"template",
					"invoice.html"
				);
				const templateContent = fs.readFileSync(templatePath, 'utf-8');
				var document = {
					html: templateContent,
					data: {
						data: existOrder.dataValues
					},
					// type: 'stream'
					path: './output2.pdf'
				};
				var options = {
					format: "A3",
					orientation: "portrait",
					border: "10mm",
				};
				//convert HTML template to pdf
				pdf.create(document, options).then((response) => {
					console.log(response, '<<<<<<<<<,');
					const fileName = `Invoice_${existOrder.order_no}.pdf`
					// Upload the generated PDF to S3
					// const uploadParams = {
					// 	Bucket: awsConfig.Bucket,
					// 	Key: 'invoices/' + fileName,
					// 	Body: response,
					// 	contentType: 'application/pdf'
					// };
					// awsConfig.s3.upload(uploadParams,async function(err,result) {
					// 	if(err) {
					// 		console.error("Error uploading to S3:",err);
					// 	} else {
					// 		await orderModel.update({invoice_no: existOrder.dataValues.invoice_no,invoice_path: result.Location},
					// 			{
					// 				where: {
					// 					id: data.order_id,
					// 					//user_id: user.id,
					// 					is_deleted: false
					// 				}
					// 			}).then((updateData) => {
					// 				if(updateData) {
					// 					return res.send(setRes(resCode.OK,true,"Invoice generated successfully for this order",result.Location))
					// 				}
					// 			})
					// 	}
					// });
				})
					.catch((error) => {
						console.error(error);
						return res.send(setRes(resCode.BadRequest, false, "Can not Generate Invoice", null))
					});
			} else {
				return res.send(setRes(resCode.OK, true, "Invoice generated successfully for this order", existOrder.invoice_path))
			}
		} else {
			return res.send(
				setRes(
					resCode.BadRequest,
					false,
					requiredFields.toString() + " are required",
					null
				)
			);
		}
	} catch (error) {
		console.log(error);
		return res.send(setRes(resCode.BadRequest, false, "Something went wrong", null))
	}

}