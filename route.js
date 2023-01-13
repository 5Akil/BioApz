module.exports = function (app) {
  app.use('/api/common', require('./api/common'))
  app.use('/api/user', require('./api/user'))
  app.use('/api/business', require('./api/business'))
  app.use('/api/product', require('./api/product'))
  app.use('/api/calendar', require('./api/calendar'))
  app.use('/api/promo', require('./api/promos'))
}
