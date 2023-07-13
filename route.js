const { Route53 } = require('aws-sdk')

module.exports = function (app) {
  app.use('/api/common', require('./api/common'))
  app.use('/api/business', require('./api/business'))
  app.use('/api/product', require('./api/product'))
  app.use('/api/calendar', require('./api/calendar'))
  app.use('/api/promo', require('./api/promos'))
  app.use('/api/gift-card-template', require('./api/gift-card-template'))
  app.use('/api/shopping-cart', require('./api/shopping-cart'))
  app.use('/api/wishlist', require('./api/wishlist'))
  app.use('/api/order', require('./api/order'))
  app.use('/api/faq', require('./api/faq'))
  app.use('/api/cms', require('./api/cms'))
  app.use('/api/setting', require('./api/setting'))

  // Bussiness Routes
  app.use('/api/gift-cards', require('./api/gift-cards'))
  app.use('/api/rewards', require('./api/gift-cards'))
  app.use('/api/cashbacks', require('./api/cashbacks'))
  app.use('/api/discounts', require('./api/discounts'))
  app.use('/api/coupones', require('./api/coupones'))
  app.use('/api/loyalty_points', require('./api/loyalty-points'))

  // User APP Routes 
  app.use('/api/user', require('./api/user'))

  // User APP Routes 
  app.use('/api/countries', require('./api/country'))

  app.use('/api/device_token', require('./api/device-token'))
}
