var moment = require('moment')

module.exports = (sequelize, DataTypes) => {
  const ComboCalendar = sequelize.define('combo_calendar', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
      type: DataTypes.INTEGER,
    },
    images: {
      type: DataTypes.TEXT,
      get() {
        return this.getDataValue('images') ? this.getDataValue('images').split(';') : ''
      },
      set(val) {
        this.setDataValue('images',val.join(';'));
      },
    },
    title: {
      type: DataTypes.STRING
    },
    description: {
      type: DataTypes.TEXT
    },
    repeat_every: {
      type: DataTypes.INTEGER,
      defaultValue: 0 // [0 - 1Day, 1 - weekly, 2 - daily]

      // type: DataTypes.TEXT,
      // get() {
      //   return JSON.parse(this.getDataValue('repeat'));
      // },
      // set(val) {
      //     this.setDataValue('repeat', JSON.stringify(val));
      // },
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
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,      
    }
  }, {
    // timestamps: false
  });
  ComboCalendar.associate = function(models) {
    // associations can be defined here
    ComboCalendar.belongsTo(models.business, {foreignKey: 'business_id'})
  };
  return ComboCalendar;
};