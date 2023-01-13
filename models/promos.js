'use strict';
module.exports = (sequelize, DataTypes) => {
  const Promos = sequelize.define('promos', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
        type: DataTypes.INTEGER,
    },
    promo_code: DataTypes.STRING,
    description: DataTypes.TEXT,
    image: DataTypes.STRING,
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    repeat_every: {
      type: DataTypes.INTEGER,
      defaultValue: 0 // [0 - 1Day, 1 - weekly, 2 - daily]
    },
    repeat_on: {
      type: DataTypes.TEXT,
      defaultValue: null,
      get() {
        return this.getDataValue('repeat_on') ? this.getDataValue('repeat_on').split(',') : ''
      },
      set(val) {
        typeof val == 'string' ? this.setDataValue('repeat_on',val) : this.setDataValue('repeat_on',val.join(','));
      },
    },
    start_date: {
      type: DataTypes.STRING
    },
    end_date: {
      type: DataTypes.STRING
    },
    repeat: {
      type: DataTypes.BOOLEAN,
      defaultValue: false // Repeat [true - yes, false - no]
    },
  }, {
    // timestamps: false
  });
  Promos.associate = function(models) {
    // associations can be defined here
    Promos.belongsTo(models.business, {foreignKey: 'business_id'})
  };
  return Promos;
};