const bcrypt = require("bcrypt");

module.exports = (sequelize, DataTypes) => {
  const Business = sequelize.define('business', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    role_id: {
      type: DataTypes.INTEGER,
      defaultValue: 3 //user - 2, admin - 1, 3 - bussness
    },
    category_id: {
        type: DataTypes.INTEGER
    },
    template_id: {
      type: DataTypes.INTEGER
    },
    color_code: {
      type: DataTypes.STRING
    },
    sections: {
      type: DataTypes.TEXT,
      get() {
        return this.getDataValue('sections') ? this.getDataValue('sections').split(';') : ''
      },
      set(val) {
        this.setDataValue('sections',val.join(';'));
      },
    },
    approve_by: {
      type: DataTypes.INTEGER
    },
    is_active: {
      type: DataTypes.INTEGER,
      defaultValue: 1 //0 - deactive, 1 -active
    },
    business_name: DataTypes.STRING,
    email: {
      type: DataTypes.STRING,
      // unique: true
    },
    booking_facility: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    abn_no: DataTypes.STRING,
    banner: DataTypes.STRING,
    address: DataTypes.TEXT,
    password: DataTypes.STRING,
    account_name: DataTypes.STRING,
    account_number: DataTypes.STRING,
    latitude: DataTypes.DOUBLE,
    longitude: DataTypes.DOUBLE,
    description: DataTypes.TEXT,
    person_name: DataTypes.STRING,
    phone: DataTypes.STRING,
    // business_detail: DataTypes.TEXT,
    reset_pass_token: {
      type: DataTypes.STRING
    },
    reset_pass_expire: {
      type: DataTypes.STRING
    },
    device_token: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    device_id: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    device_type: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    auth_token: {
      type: DataTypes.STRING,
      defaultValue: null
    }
  }, {
    // timestamps: false
  });

  Business.beforeCreate((business, options) => {

    return bcrypt.hash(business.password, 10)
        .then(hash => {
            business.password = hash;
        })
        .catch(err => { 
            throw new Error(); 
        });
});

// // relations
// users.belongsToMany(models.companiesModel, { as: 'Companies', through: 'OwnerCompany' })
// companies.belongsToMany(models.usersModel, { as: 'Owners', through: 'OwnerCompany' })

Business.associate = function(models) {
    // associations can be defined here
    Business.belongsTo(models.business_categorys, {foreignKey: 'category_id'})
    Business.hasMany(models.ratings, {foreignKey: 'business_id'})
    Business.hasMany(models.products, {foreignKey: 'business_id'}) 
    Business.belongsTo(models.templates, {foreignKey: 'template_id'})
    Business.hasMany(models.offers, {foreignKey: 'business_id'})
    Business.hasMany(models.combo_calendar, {foreignKey: 'business_id'})
    Business.hasMany(models.promos, {foreignKey: 'business_id'})
    Business.hasMany(models.user_events, {foreignKey: 'business_id'}) 
    Business.hasMany(models.gift_cards, {foreignKey: 'business_id'})
    Business.hasMany(models.cashbacks, {foreignKey: 'business_id'})
    Business.hasMany(models.discounts, {foreignKey: 'business_id'})
    Business.hasMany(models.coupones, {foreignKey: 'business_id'})
    Business.hasMany(models.loyalty_points, {foreignKey: 'business_id'})
  };
  return Business;
};