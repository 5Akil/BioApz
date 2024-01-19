const fcmNotification = require("../../push_notification");

const stripe = require('stripe')('sk_test_51NlQ2gKS84M9Y9IrknyYsTQ45tpRk4NEqCYDiBO76nI1Y9f6EwjYHafHxTAIaG2YKEcWKgTR5uHGBrPVo5vREgU200Ys98t5bG');
// const stripe = require('stripe')('sk_test_51O5nxNIYYpj5fzgm4PajPvJkw7Ep1Ebknew6wSpMseXdaMKnsS8cJpugkrykgFleKS9OZFrH96tDMrMavwXs0nmV00uuMvzEdr');
const bcrypt = require('bcrypt');
const setRes = require("../../response");
const resCode = require("../../config/res_code_config");
const models = require("../../models");
var nodemailer = require("nodemailer");
var mailConfig = require("../../config/mail_config");
const EmailTemplates = require('swig-email-templates');
const moment = require('moment');
const { NOTIFICATION_MESSAGE, NOTIFICATION_TYPES, NOTIFICATION_TITLES } = require('../../config/notificationTypes');
const path = require('path');

const orderModel = models.orders


exports.stripeConnectAuthentication = async (req, res) => {
  try {
    const { code } = req.query;
    const state = req.query.state                 //get state from req object
    const business_id = state.split('=')[1]        //get business id form state
    const businessModel = models.business
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code: code,
    });
    console.log(response);
    // if (response && business_id) {
    //   var connected_account_id = response.stripe_user_id;
    //   const hashedAccountID = await bcrypt.hash(connected_account_id, 10)
    //   const business = await businessModel.update(
    //     { stripe_account_id: hashedAccountID },
    //     {
    //       where: {
    //         id: business_id,
    //         is_active: true,
    //         is_deleted: false
    //       }
    //     }
    //   )
    //   if (business != 0) {
    //     return res.send(setRes(resCode.OK, false, "You are now connected with stripe", null))
    //   } else {
    //     return res.send(setRes(resCode.OK, false, "error", null))
    //   }
    // }
  }
  catch (error) {
    console.log(error);
    return res.send(setRes(resCode.BadRequest, false, "something went wrong", null));
  }

}

exports.payment = async (req, res) => {

  // console.log(req.body, '<<<<<<<<<<<<,,,');
  try {
    // const account = await stripe.accounts.update(
    //   'acct_1O9oGHIEa9p75b2w',
    //   {
    //     tos_acceptance: {
    //       date: 1609798905,
    //       ip: '8.8.8.8',
    //     },
    //   }
    // );

    const paymentIntent = await stripe.paymentIntents.create({
      amount: req.body.amount * 100,
      currency: 'aud',
      payment_method: req.body.id,
      payment_method_types: ['card'],
      metadata: {
        order_no: 'SQ9zHo2MsY',
        user_id: 105,
        purchase_type: 'giftCardPurchase',
        gift_card_id: '3'
      },
      // transfer_group: 'SQ9zHo2MsY',
      transfer_data: {
        destination: 'acct_1O5oJHI3Jke2j9vr',
        // destination:'acct_1O9nW1HCIpEQ4x7K',
        amount: 9000, // Amount to transfer to the connected account in cents
      },
    });
    // console.log(paymentIntent, '<<<<<<<<<<<<<<<<<<<<<<<<');
    const result = await stripe.paymentIntents.confirm(
      paymentIntent.id,
    );
    console.log(result);
    // return res.send({client_secret:paymentIntent.client_secret})
  } catch (error) {
    console.log(error, 'Error <==========');
  }
}

// exports.payment = async (req, res) => {
//   try {
//     const paymentIntent = await stripe.paymentIntents.create({
//       amount: req.body.amount * 100,
//       currency: 'aud',
//       payment_method_types: ['card'],
//       metadata: {
//         order_no: 'SQ9zHo2MsY',
//       },
//       transfer_data: {
//         destination: 'acct_1O5oJHI3Jke2j9vr',
//         amount: 9000, 
//       },
//     });
//     console.log(paymentIntent, '<<<<<<<<<<<<<<<<<<<<<<<<');
//     return res.send({client_secret:paymentIntent.client_secret})
//   } catch (error) {
//     console.log(error, 'Error <==========');
//   }
// }

exports.webhook = async (req, res) => {
  const endpointSecret = "whsec_fb2dd9678a42a5eefa843be09feca86117f544773d4f710a3143d51089afb781";
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(err, '<<<<<<<<<<<<<<<<<');
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.created':
      const paymentIntentCreated = event.data.object;
      // console.log(paymentIntentCreated.status, '///////////');
      break;
    case 'payment_intent.succeeded':
      const paymentIntentSucceeded = event.data.object;
      // console.log(paymentIntentSucceeded, '<<<<<<<=================');
      break;
    case 'charge.succeeded':
      const charge = event.data.object;
      console.log(charge, '<+++++++++++++++++++++++++++=');
      try {
        if (charge.status === 'succeeded') {

          switch (charge.metadata.purchase_type) {
            case "giftCardPurchase":

              console.log("req.body", req.body);
              const Op = models.Op;
              const giftCardModel = models.gift_cards;
              const userModel = models.user;
              const rewardHistoryModel = models.reward_history;
              const notificationModel = models.notifications;
              const notificationReceiverModel = models.notification_receivers;
              const deviceModel = models.device_tokens;


              const userDetails = await userModel.findOne({
                where: { id: 105, is_active: true, is_deleted: false },
              });
              // console.log(userDetails ,"<================== userDetails");


              const userCashbackLoyalty = await userModel.findOne({
                where: {
                  id: userDetails.id,
                  is_deleted: false,
                },
              });

              // console.log(userCashbackLoyalty ,"<================== userCashbackLoyalty");

              const giftCardDetails = await giftCardModel.findOne({
                where: { id: charge.metadata.gift_card_id, status: true, isDeleted: false },
              });
              // console.log(giftCardDetails ,"<================== giftCardDetails");


              if (giftCardDetails.is_cashback == true) {
                const giftcardcashbackamount = (
                  (giftCardDetails.amount * giftCardDetails.cashback_percentage) /
                  100
                ).toFixed(2);
                const usercashback = userCashbackLoyalty.total_cashbacks || 0.0;
                const usertotalCashback =
                  parseFloat(usercashback) + parseFloat(giftcardcashbackamount);

                const updateCashback = userCashbackLoyalty.update({
                  total_cashbacks: usertotalCashback,
                });
              }

              const loyaltyPointModel = models.loyalty_points;
              const loyalty = await loyaltyPointModel.findOne({
                attributes: {
                  exclude: ["createdAt", "updatedAt", "deleted_at", "isDeleted"],
                },
                where: {
                  gift_card_id: {
                    [Op.regexp]: `(^|,)${giftCardDetails.id}(,|$)`,
                  },
                  status: true,
                  isDeleted: false,
                },
              });
              if (loyalty != null) {
                if (loyalty.points_redeemed == true && loyalty) {
                  const giftcardloyaltyamount = loyalty.points_earned || 0.0;
                  const userloyalty =
                    userCashbackLoyalty.total_loyalty_points || 0.0;
                  const usertotalLoyalty =
                    parseFloat(userloyalty) + parseFloat(giftcardloyaltyamount);
                  const updateCashback = userCashbackLoyalty.update({
                    total_loyalty_points: usertotalLoyalty,
                  });
                }
              }

              const createRewardHistory = await rewardHistoryModel.create({
                amount: 1500,
                reference_reward_id: 3,
                reference_reward_type: "gift_cards",
              });
              // createdGiftCards.push(gCard);
              /** Send Email Notification to user */
              const transporter = nodemailer.createTransport({
                host: mailConfig.host,
                port: mailConfig.port,
                secure: mailConfig.secure,
                auth: mailConfig.auth,
                tls: mailConfig.tls,
              });
              // console.log(createRewardHistory ,"<================== rewardHistoryModel");

              const templates = new EmailTemplates({
                juice: {
                  webResources: {
                    images: false,
                  },
                },
              });
              const expiryDate = moment(giftCardDetails.expire_at).format(
                "MMM DD,YYYY"
              );
              const context = {
                userName: userDetails.username,
                giftCardName: giftCardDetails.name,
                giftCardAmount: giftCardDetails.amount,
                // giftCardUrl: `${giftCardImage}`,
                expireDate: expiryDate,
                giftCardQty: 1,
              };

              templates.render(
                path.join(
                  __dirname,
                  "../../",
                  "template",
                  "gift-card-purchased.html"
                ),
                context,
                (err, html, text, subject) => {
                  transporter.sendMail(
                    {
                      from: "b.a.s.e. <do-not-reply@mail.com>",
                      to: userDetails.email,
                      subject: `B.a.s.e Virtual card`,
                      html: html,
                    },
                    function (err, result) {
                      if (err) {
                        console.log("mail error", err);
                      }
                    }
                  );
                }
              );
              /** END Send Email Notification to user */

              /** Send Puch Notification */
              const notificationObj = {
                params: JSON.stringify({
                  notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
                  title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
                    userDetails?.username
                  ),
                  message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
                    userDetails?.username,
                    giftCardDetails?.name
                  ),
                  giftcard_id: 3,
                  user_id: 105,
                  business_id: giftCardDetails.business_id,
                }),
                title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
                  userDetails?.username
                ),
                message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
                  userDetails?.username,
                  giftCardDetails?.name
                ),
                notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
              };
              const notification = await notificationModel.create(notificationObj);
              if (notification && notification.id) {
                const notificationReceiverObj = {
                  role_id: 3,
                  notification_id: notification.id,
                  receiver_id: giftCardDetails.business_id,
                  is_read: false,
                };
                const notificationReceiver = await notificationReceiverModel.create(
                  notificationReceiverObj
                );
              }
              /** FCM push noifiation */
              const activeReceiverDevices = await deviceModel.findAll(
                { where: { status: 1, business_id: giftCardDetails.business_id } },
                { attributes: ["device_token"] }
              );
              const deviceTokensList = activeReceiverDevices.map(
                (device) => device.device_token
              );
              const uniqueDeviceTokens = Array.from(new Set(deviceTokensList));
              const notificationPayload = {
                device_token: uniqueDeviceTokens,
                title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
                  userDetails?.username
                ),
                message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
                  userDetails?.username,
                  giftCardDetails?.name
                ),
                content: {
                  notification_type: NOTIFICATION_TYPES.GIFT_CARD_PURCHASE,
                  notification_id: notification.id,
                  title: NOTIFICATION_TITLES.GIFT_CARD_PURCHASE(
                    userDetails?.username
                  ),
                  message: NOTIFICATION_MESSAGE.GIFT_CARD_PURCHASE(
                    userDetails?.username,
                    giftCardDetails?.name
                  ),
                  giftcard_id: 3,
                  user_id: 105,
                  business_id: giftCardDetails.business_id,
                },
              };
              fcmNotification.SendNotification(notificationPayload);
              /** END Puch Notification */

              break;

            case "orderPurchase":

              console.log('hello  order purchase hear');

              //order related code will be placed hear
              const order = await orderModel.update(
                { payment_status: 2 },
                { where: { order_no: charge.metadata.order_no } }
              );

              break;
          }

        }
      } catch (error) {
        console.error('Error processing charge.succeeded event:', error);
        res.status(500).send('Internal Server Error');
        return;
      }
    default:
      console.log(`Unhandled event type ${event.type}`);
  }
  // Return a 200 res to acknowledge receipt of the event
  // res.send();
  res.json({ received: true });
};


exports.customer = async (req, res) => {

  // const account = await stripe.accounts.update(
  //   'acct_1OIR9y4ILjCuVZCG',
  // {
  //     tos_acceptance: {
  //       service_agreement: 'recipient',
  //   },
  // }
  // );

  // const account = await stripe.accounts.create({
  //   country: 'AU',
  //   type: 'custom',
  //   capabilities: {
  //     card_payments: {
  //       requested: true,
  //     },
  //     transfers: {
  //       requested: true,
  //     },
  //   },
  //   business_type: 'individual',
  //   business_profile: {
  //     name: 'Test Business',
  //     mcc: '5734',
  //     url: 'https://accessible.stripe.com',
  //     product_description: 'Description of your business and products/services',
  //     support_address: {
  //       line1: ' 87 Bailey Street',
  //       city: 'Gazette',
  //       postal_code: '3289',
  //       state: 'Victoria',
  //       country: 'AU',
  //     },
  //     support_email: 'support@bioapzbusiness.com',
  //     support_phone: '+61212341235',
  //   },
  //   individual: {
  //     first_name: 'John',
  //     last_name: 'Doe',
  //     email: 'john.doe@example.com',
  //     phone: '+61212341235',
  //     address: {
  //       line1: ' 87 Bailey Street',
  //       city: 'Gazette',
  //       postal_code: '3289',
  //       state: 'Victoria',
  //       country: 'AU',
  //     },
  //     dob: {
  //       day: 1,
  //       month: 1,
  //       year: 1990,
  //     },

  //   },
  //   tos_acceptance: {
  //     date: Math.floor(Date.now() / 1000),
  //     ip: '8.8.8.8',
  //   },
  //   external_account: {
  //     object: 'bank_account',
  //     country: 'AU',
  //     currency: 'aud',
  //     account_holder_name: 'John Doe',
  //     account_holder_type: 'individual',
  //     routing_number: '110000',
  //     account_number: '000123456',
  //   },
  // });

  stripe.accounts.del("acct_1OIR2h4F2GIIMvxE")
    .then(deletedAccount => {
      console.log('Connected Account Deleted:', deletedAccount.id);
    })
    .catch(error => {
      console.error('Error:', error);
    });

  console.log(account, ',,,,,,,,,,');

}




