var express = require('express')

var router = express.Router()
var multer = require('multer');
const uuidv1 = require('uuid/v1');
const moment = require('moment')

var companyImages = multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'public/images')
      },
      filename: function (req, file, cb) {
        var fileExtension = file.mimetype.split('/')[1];
        cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
      }
    })
})

var upload =  multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'public/offers')
      },
      filename: function (req, file, cb) {
        var fileExtension = file.mimetype.split('/')[1];
        cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
      }
    })
})

var banner =  multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'public/banners')
      },
      filename: function (req, file, cb) {
        // var fileExtension = file.mimetype.split('/')[1];
        // cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
        cb(null, `${file.originalname}`)
      }
    })
})

var controller = require('./business.controller')

const {verifyToken} = require('../../config/token');

router.post('/inquiry', verifyToken, controller.createInquiry)
router.post('/recommended', verifyToken, controller.GetRecommendedBusiness)
router.post('/getBusinessDetail', verifyToken, controller.GetBusinessDetail);
router.post('/updateBusinessDetail', verifyToken, controller.UpdateBusinessDetail)
router.post('/getImages', verifyToken, controller.GetImages);
router.post('/uploadImages', verifyToken, companyImages.array('images'), controller.UploadCompanyImages)
router.post('/getAll', verifyToken, controller.GetAllOffers)
router.post('/updateOffers', verifyToken, upload.single('image'), controller.UpdateOfferDetail)
router.post('/banner_booking', verifyToken , banner.single('banner'), controller.ManageBannerAndBooking);
router.post('/register', controller.CreateBusiness)
router.post('/initChat', verifyToken, controller.ChatInitialize)

router.post('/createOffer', verifyToken, upload.single('image'), controller.CreateOffer)
router.post('/updateOffer', verifyToken, upload.single('image'), controller.UpdateOffer)
router.post('/getOffers', verifyToken, controller.GetOffers)
//booking api for react restaurants templates
router.post('/restaurants-booking', verifyToken, controller.RestaurantsBooking)

module.exports = router;
