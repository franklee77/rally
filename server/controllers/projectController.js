const Project = require('../constructors/Project.js');

// ProjectController is responsible for creating and terminating
// projects. It also routes incoming socket messages to the appropriate
// Project object.

class ProjectController {

  constructor(db, io) {
    // Stores all Project objects in existence. It has the following form:
    // { projectId1: Project1,
    //   projectId2: Project2 }
    this.allProjects = {};

    // Time between database backups
    this.backUpTime = 10000;

    /***************************************************
    // Query database for projects, intialize a Project
    // for each entry, and populate this.allProjects obj
    ***************************************************/
    db.Project.findAll({}).then((projects) => {
      projects.forEach((project) => {
        let data = project.dataValues;
        let options = {
          projectType: data.projectType,
          title: data.title,
          complete: data.complete,
          time: data.time,
          dataSet: data.dataSet,
          generateDataSet: data.generateDataSet,
          completedJobs: JSON.parse(data.completedJobs),
          mapData: data.mapData,
          reduceResults: data.reduceResults,
          finalResult: JSON.parse(data.finalResult)
        };
        this.allProjects[data.projectId] = new Project(options, data.projectId, io);
      });

      /***************************************************
      // Iterate over projects in this.allProjects object
      // and save to the database once per minute
      ***************************************************/
      setInterval((() => {
        return () => {
          // First clear out the database
          db.Project.destroy({
            where: {}
          // Then resave all projects
          }).then(() => {
            for (var obj in this.allProjects) {
              let project = this.allProjects[obj];
              db.Project.create({
                projectId: project.projectId,
                projectType: project.projectType,
                title: project.title,
                complete: project.complete,
                time: project.time,
                dataSet: project.dataSet,
                generateDataSet: project.generateDataSet,
                completedJobs: JSON.stringify(project.completedJobs),
                mapData: project.mapData,
                reduceResults: project.reduceResults,
                finalResult: JSON.stringify(project.finalResult)
              });
            }
          });
        };
      })(), this.backUpTime);
    });

    // Keeps a record of all Worker instances in existence.
    // Socket id is used to log workers because the Worker object
    // uses socket id as the worker id. The ledger stores the project id
    // rather than a reference to the Worker object itself.

    // It has the following form:
    // { socketId1: projectId,
    //   socketId2: projectId }
    this.allWorkers = {};

    this.io = io;
  }

  /*
  ======================
  SOCKETROUTES.JS EVENTS
  ======================
  */

  userDisconnect(socketId) {
    // Identifies the project that the disconnected user was contributing to
    // and calls the removeWorker method for that project
    if (this.allWorkers[socketId] !== undefined) {
      console.log('Removing user from global workers list:', socketId);

      this.allProjects[this.allWorkers[socketId]].removeWorker(socketId);
      delete this.allWorkers[socketId];

      this.sendUpdateAllProjects(this.io);

    } else {
      console.log('Error: cannot find user:', socketId);
    }
  }

  userReady(readyMessage, socket) {
    // Passes the new user's socket connection to the appropriate Project,
    // which will then create a new Worker for that user and assign it
    // an available job

    if (this.allProjects[readyMessage.projectId]) {
      // Creates a new Worker in the appropriate Project
      this.allProjects[readyMessage.projectId].createWorker(readyMessage, socket);
      // Create a record of the new Worker in the allWorkers ledger
      this.allWorkers[socket.id] = readyMessage.projectId;

    } else {
      console.log('Error in userReady: Project does not exist');
    }
  }

  userJobDone(job) {
    // The Job object will be returned from the client with the .result
    // field populated.
    let projectComplete = false;

    if (this.allProjects[job.projectId]) {
      // Check first whether the project associated with the job exists
      // then pass the job object to the appropriate project object
      console.log('User ' + job.workerId + ' completed a job: ' + job);
      projectComplete = this.allProjects[job.projectId].handleResult(job);

      if (projectComplete) {
        this.sendUpdateAllProjects(this.io);
      }

    } else {
      console.log('Error in userJobDone: project does not exist');
    }
  }

  createProject(options, io) {
    // Create a new instance of Project with the pass-in options parameters
    // Assign a project ID to the new Project and create a new Project
    const projectId = 'project' + Object.keys(this.allProjects).length;
    const newProject = new Project(options, projectId, io);

    // Store the newly created project in the allProjects object
    this.allProjects[projectId] = newProject;

    // Send the updated projects list to all socket connections
    let projectList = [];
    for (var key in this.allProjects) {
      projectList.push({
        projectId: this.allProjects[key].projectId,
        projectType: this.allProjects[key].projectType,
        jobsLength: this.allProjects[key].jobsLength,
        title: this.allProjects[key].title
      });
    }

    this.sendUpdateAllProjects(io);
  }

  // Sends status of projects to all connected users
  sendUpdateAllProjects(destination) {
    let allProjectsUpdate = [];

    // Initialize project update information
    for (var key in this.allProjects) {
      const project = this.allProjects[key];
      const projectId = key + '';

      const completedJobs = [];
      project.completedJobs.map( (item) => {
        completedJobs.push(item);
      });

      // WorkersList: [ Worker1, Worker2 ]
      const workersList = [];

      for (var k in project.workers) {
        workersList.push({
          workerId: project.workers[k].workerId,
          projectId: project.workers[k].projectId,
          jobId: project.workers[k].currentJob === null ? null : project.workers[k].currentJob.jobId
        });
      }

      const finalResult = [];
      finalResult.push(project.finalResult);

      allProjectsUpdate.push({
        projectId: project.projectId,
        projectType: project.projectType,
        title: project.title,
        availableJobsNum: project.availableJobs.length,
        jobsLength: project.jobsLength,
        completedJobs: completedJobs,
        workers: workersList,
        finalResult: project.finalResult,
        complete: project.complete,
        projectTime: project.projectTime
      });
    }

    // Checks whether destination is a io object or a socket connection
    if (destination.id) {
      destination.emit('updateAllProjects', allProjectsUpdate);
    } else {
      destination.emit('updateAllProjects', allProjectsUpdate);
    }
  }

  //TODO: completeProject method
  completeProject() {
    console.log('Project done');
  }
}

module.exports = ProjectController;
