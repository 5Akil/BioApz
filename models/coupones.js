'use strict';
module.exports = (sequelize, DataTypes) => {
  const Coupones = sequelize.define('coupones', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
        type: DataTypes.INTEGER,
    },
    title: DataTypes.STRING,
    coupon_code: DataTypes.STRING,
    coupon_type: {
      type: DataTypes.BOOLEAN
    },
    product_category_id: {
        type: DataTypes.INTEGER,
    },
    product_id: {
        type: DataTypes.INTEGER,
    },
    value_type: {
      type: DataTypes.BOOLEAN,
    },
    coupon_value: DataTypes.DECIMAL,
    expire_at: DataTypes.DATE,
    description: DataTypes.STRING,
    validity_for: DataTypes.INTEGER,
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },    
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, {
     paranoid: true,
     deletedAt: 'deleted_at',
    // timestamps: false
  });

  Coupones.beforeCreate(async (coupones, options) => {
    function generateCouponCode(length) {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let couponCode = '';
      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        couponCode += characters.charAt(randomIndex);
      }
      return couponCode;
    }
    // Generate a unique coupon code with a length of 6 characters
    const couponCode = generateCouponCode(6);
    let id = couponCode;
    coupones.coupon_code = id;
  });
  
  Coupones.associate = function(models) {
    // associations can be defined here
    Coupones.belongsTo(models.business, {foreignKey: 'business_id'})
  };
  return Coupones;
};