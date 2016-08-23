import React, { Component } from 'react';
import io from 'socket.io-client';
import NavbarView from '../components/NavbarView';
import Promise from 'bluebird';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { createdSocket,
         updateProjects,
         updateWorkers,
         newJob,
         completeJob,
         sendCompleteJob,
         updateResults,
         finalResults,
         createWebWorkersPool,
         updateAllProjects,
         updatePendingProjects
       } from '../actions/actions';

export default class AppView extends Component {
  constructor(props) {
    super(props);
    this.socket = io();
    this.webWorkerPool = null;
    this.ANNWorkerPool = null;
    this.ANNJobPool = [];
  }

  componentWillMount() {
    /************************************************
    // Web Worker Handlers
    ************************************************/

    // Check if user's computer can run web workers
    if (typeof(Worker) === 'undefined') {
      console.log('This browser does not support Web Workers. The main browser process will perform the calculations, which will likely cause noticeable delays.');

    } else {

      // Create a Web Worker pool based on the maximum number of 
      // concurrent processes that user's CPU can support. Default to 
      // two workers if navigator.hardwareConcurrency is unavailable
      const MAX_WEBWORKERS = navigator.hardwareConcurrency || 2;
      this.webWorkerPool = [];

      for (var i = 0; i < MAX_WEBWORKERS; i++) {
        let newWorker = {
          worker: new Worker('/webWorker'),
          isBusy: false,
          jobId: null
        }
    
        newWorker.worker.onmessage = (event) => {
          console.log('Sending completed job to server');
          const job = event.data;

          this.webWorkerPool.forEach( (worker) => {
            if (worker.jobId === job.jobId) {
              worker.isBusy = false;
              worker.jobId = null;
            }
          });

          this.socket.emit('userJobDone', job);
        };

        this.webWorkerPool.push(newWorker);
      }
      // console.log('Web worker pool initialized:', this.webWorkerPool);
      this.props.createWebWorkersPool(this.webWorkerPool);
    }

    /************************************************
    // Web Socket Handlers
    ************************************************/

    // Client must be able to handle the following events:
    // - newJob
    // - updateWorkers
    // - updateResults
    // - finalResult
    // - connect
    this.socket.on('connect', () => {
      this.props.createdSocket(this.socket);
    });

    this.socket.on('updateWorkers', (workers) => {
      this.props.updateWorkers(workers); 
    });

    this.socket.on('newJob', (job) => {
      this.props.newJob(job);
      // console.log('Web worker pool:', this.webWorkerPool);
      console.log('New job', job);
      if (this.webWorkerPool !== null) {
        console.log('Assigning new job to an available web worker');
        let availableWorker = false;

        this.webWorkerPool.forEach( (worker) => {
          if (!worker.isBusy) {
            availableWorker = worker;
          }
        });

        if (availableWorker) {
          availableWorker.worker.postMessage(job);
          availableWorker.jobId = job.jobId;
          availableWorker.isBusy = true;
        } else {
          console.log('Error: no web workers available');
        }

      } else {

        console.log('This browser does not support Web Workers. Analysis will run in the main browser process, which may cause noticeable delays in browser performance.');

        var mapDataFunc = eval('(' + job.mapData + ')');
        job.result = mapDataFunc(job.data);

        // console.log('Job complete. Result is: ', job.result);
        console.log('Job complete. Sending result back to server');
        
        this.socket.emit('userJobDone', job);
      }
    });

    this.socket.on('finalResult', (final) => {
      this.props.finalResults(final);
    });

    this.socket.on('updateAllProjects', (allProjectsUpdate) => {

      const projectList = [];
      const resultsList = {};

      allProjectsUpdate.map( (project) => {
        // Update the status of existing projects

        projectList.push({
          projectId: project.projectId,
          projectType: project.projectType,
          jobsLength: project.jobsLength,
          title: project.title,
          availableJobsNum: project.availableJobsNum,
          workers: project.workers,
          finalResult: project.finalResult,
          complete: project.complete,
          projectTime: project.projectTime
        });

        // Update results of all projects
        resultsList[project.projectId] = project.completedJobs === null ? [] : project.completedJobs;
      });
      console.log('Available projects:', projectList);
      this.props.updateAllProjects(allProjectsUpdate);
      this.props.updateProjects(projectList);
      this.props.updateResults(resultsList);
    });


    // Update list of pending projects
    this.socket.on('updatePendingProjects', (pendingProjects) => {
      this.props.updatePendingProjects(pendingProjects);
    });

    /*
      NEUTRAL NETWORK HANDLERS
    */

    this.initializeANNWebWorkers();

    this.socket.on('newANNJob', (newJob) => {
      // console.log('Receiving new ANNJob', newJob);
      this.ANNJobPool.push(newJob);

      // console.log(this.ANNJobPool.length, this.ANNWorkerPool.length);

      if (this.ANNJobPool.length === this.ANNWorkerPool.length || 
          newJob.jobId === newJob.jobsLength - 1) {
        console.log('Reached full ANN pool. Beginning epoch cycle now');
        this.beginEpochCycle(this.ANNJobPool);
      }

    });
    
    const socketMethods = {
      socket: this.socket
    };
  }

  /*
    NEURAL NETWORK EPOCH LIFECYCLE METHODS
  */
  initializeANNWebWorkers() {
    // TODO: Should this be a promise? These are async ops
    const MAX_WORKERS = navigator.hardwareConcurrency || 2;
    this.ANNWorkerPool = [];

    for (var i = 0; i < MAX_WORKERS; i++) {
      const worker = {
        worker: new Worker('/ANNworker'),
        workerId: i,
        isBusy: false
      }

      this.ANNWorkerPool.push(worker);
    }
    console.log('ANNWorkers initialized:', this.ANNWorkerPool);
  }

  beginEpochCycle(ANNJobPool) {
    console.log('Beginning Epoch Cycle:', ANNJobPool.length);
    // Assign job to each ANN worker
    const workerPromises = [];
    const projectId = ANNJobPool[0].projectId;
    const doneJob = ANNJobPool[0];

    for (var key in this.ANNWorkerPool) {
      if (ANNJobPool.pop()) {
        const promise = this.assignANNJob(this.ANNWorkerPool[key].worker, ANNJobPool.pop());
        workerPromises.push(promise);
      }
    }

    Promise.all(workerPromises)
      .then( (partialNetworks) => {
        console.log('All workers are done. Synchronizing.');
        return this.syncEpochResults(partialNetworks);
      })
      .then( (updatedNetwork) => {
        console.log('Network with reconciled weight:', updatedNetwork);
        
        console.log('finished job template:', doneJob);
        doneJob.result = updatedNetwork;
        this.socket.emit('ANNUpdatedNetwork', doneJob);
      });
  }

  assignANNJob(worker, newJob) {
    console.log('Assigning job to', worker);
    return new Promise( (resolve, reject) => {
      worker.postMessage(newJob);
      worker.isBusy = true;

      worker.onmessage = (e) => {
        worker.isBusy = false;
        resolve(e.data);
      };
    });
  }

  syncEpochResults(partialNetworks) {
    console.log('Inside sync', partialNetworks);
    // Testing whether this shit works
    partialNetworks.forEach( (network, i) => {
      console.log(`Network ${i}: ${network.trainedNetwork.connections[0].weight}`);
    });

    for (var i = 1; i < partialNetworks.length; i++) {
      for (var j = 0; j < partialNetworks[0].trainedNetwork.connections.length; j++) {
        partialNetworks[0].trainedNetwork.connections[j].weight =
         partialNetworks[0].trainedNetwork.connections[j].weight + 
         partialNetworks[i].trainedNetwork.connections[j].weight;
      }
    }
    console.log('After op:', partialNetworks[0].trainedNetwork.connections[0].weight);

    console.log('Reconciled the weights of partial networks');
    return partialNetworks[0];
  }

  render() {
    return (
      <div className="app">
        <NavbarView auth={this.props.auth}/>

        <div className="container">
          {this.props.children}
        </div>
      </div>
    );
  }
}

function mapStateToProps(state) {
  return {
    auth: state.auth,
    projects: state.projects
  };
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators(
    { createdSocket,
      updateProjects,
      updateWorkers,
      newJob,
      completeJob,
      sendCompleteJob,
      updateResults,
      finalResults,
      createWebWorkersPool,
      updateAllProjects,
      updatePendingProjects
    }, dispatch);
}

export default connect(mapStateToProps, mapDispatchToProps)(AppView);
