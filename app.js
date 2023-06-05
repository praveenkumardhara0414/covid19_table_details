const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
let db = null;

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();
const convertHeaders = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDetails = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "praveen_dure", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//Login API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const payload = { username: username };
  const getQuery = `
        SELECT * FROM user WHERE username = '${username}';
    `;
  const userDetails = await db.get(getQuery);
  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(payload, "praveen_dure");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//GET all states API

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesDetails = `
        SELECT * FROM state;
    `;
  const statesList = await db.all(getStatesDetails);
  response.send(statesList.map((eachObject) => convertHeaders(eachObject)));
});

//GET a state API
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStatesDetails = `
        SELECT * FROM state WHERE state_id = ${stateId};
    `;
  const statesList = await db.get(getStatesDetails);
  response.send(convertHeaders(statesList));
});

//Add a district API
app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const addQuery = `
    INSERT INTO district(district_name, state_id, cases, cured, active, deaths)
    VALUES('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});
  `;
  await db.run(addQuery);
  response.send("District Successfully Added");
});

//Get a district API
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const addQuery = `
        SELECT * FROM district WHERE district_id = ${districtId};
    `;
    const responseQuery = await db.get(addQuery);
    response.send(convertDistrictDetails(responseQuery));
  }
);

//Delete a district API
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const addQuery = `
        DELETE FROM district WHERE district_id = ${districtId};
    `;
    await db.run(addQuery);
    response.send("District Removed");
  }
);

//Update a district API
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const { districtId } = request.params;
    const addQuery = `
    UPDATE district SET district_name = '${districtName}', state_id = ${stateId},
    cases = ${cases}, cured = ${cured}, active = ${active}, deaths = ${deaths}
    WHERE district_id = ${districtId};
  `;
    await db.run(addQuery);
    response.send("District Details Updated");
  }
);

//Get stats of a state
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatsQuery = `
        SELECT 
          SUM(cases),
          SUM(cured),
          SUM(active),
          SUM(deaths)
        FROM district
        WHERE state_id = ${stateId};
    `;
    const stats = await db.get(getStateStatsQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
