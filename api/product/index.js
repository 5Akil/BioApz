var express = require('express')

var router = express.Router()

var multer = require('multer');
const uuidv1 = require('uuid/v1');
const moment = require('moment')

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/products')
    },
    filename: function (req, file, cb) {
      var fileExtension = file.mimetype.split('/')[1];
      cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
    }
  })
  
  var upload = multer({ storage: storage });

var controller = require('./product.controller')

const {verifyToken} = require('../../config/token');

router.post('/inquiry', verifyToken, controller.createInquiry)
router.post('/getAll', verifyToken, controller.GetAllProducts)
router.post('/getBooking', verifyToken, controller.GetBookingInquiry)
router.post('/isRead', verifyToken, controller.IsReadStatus)
router.post('/updateProduct', verifyToken, upload.single('image'), controller.UpdateProductDetail)
// router.post('/initChat', verifyToken, controller.ChatInitialize)
router.post('/byId', verifyToken, controller.GetProductById)

module.exports = router;
