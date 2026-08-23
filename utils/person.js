const employeeModel = require('../models/employee.model');
const contractorModel = require('../models/contractor.model');

// A "person" in this app is either an internal employee or an external contractor —
// looked up by the same opaque id regardless of which table it actually lives in.
async function getPerson(pool, id) {
  return (await employeeModel.getById(pool, id)) || (await contractorModel.getById(pool, id));
}

module.exports = { getPerson };
