const Project = require('./Project.js');
const Job = require('./Job.js');
const Synaptic = require('synaptic');
const Promise = require('bluebird');
const _ = require('lodash');

const Architect = Synaptic.Architect;
const Layer = Synaptic.Layer;
const Network = Synaptic.Network;
const Trainer = Synaptic.Trainer;

const nqueensOptions = require('../projects/nQueens.js');

class ANNProject extends Project {
  /*
    Options for ANN projects need:
    {
      inputLayer: NUMBER,
      hiddenLayer: ARRAY OF NUMBERS,
      outputLayer: NUMBER,
      trainerOptions: {
        rate: NUMBER,
        iterations: NUMBER,
        error: NUMBER,
        shuffle: BOOLEAN,
        log: NUMBER
      }
    }

  */
  constructor(options, projectId) {
    super(options, projectId);
    // ANNProject class only supports Perceptron network architecture

    this.inputLayer = options.inputLayer;
    this.hiddenLayer = options.hiddenLayer;
    this.outputLayer = options.outputLayer;
    this.perceptron = new Architect.Perceptron(this.inputLayer, ...this.hiddenLayer, this.outputLayer);

    this.projectType = 'ANN';

    this.network = this.perceptron.trainer.network.toJSON();

    this.trainerOptions = options.trainerOptions;

    this.trainerOptions.cost = Trainer.cost.CROSS_ENTROPY;

    this.epochCycleReady = true;

    this.numWorkers = 4; // Default value

    this.createJobsFunc = ( (numWorkers) => {
      console.log('Using custom job creation method for ANN');
      let dataSet = JSON.parse(this.dataSet) || this.generateDataSet();
      const length = numWorkers || this.numWorkers;
      const numJobsPerSet = Math.floor(dataSet.length / length);
      const trainingSets = [];

      // Shuffle dataSet
      console.log('Shuffling dataSet');
      dataSet = _.shuffle(dataSet);

      for (var i = 0; i < length; i++) {
        let newJob;
        if (i === length - 1) {
          newJob = new Job(dataSet.slice(i * numJobsPerSet), i, this.projectId);
        } else {
          newJob = new Job(dataSet.slice(i * numJobsPerSet, (i + 1) * numJobsPerSet), i, this.projectId);
        }

        newJob.projectType = 'ANN';
        newJob.ANNNetwork = this.network;
        newJob.trainerOptions = this.trainerOptions;

        trainingSets.push(newJob);
      }
      console.log('NUMBER OF TRAINING SETS:', trainingSets.length);
      return trainingSets;
    });

    this.availableJobs = this.createJobsFunc();

    this.partialNetworks = [];

    this.testSet = options.testSet;

    this.jobsLength = this.availableJobs.length;
  }

  assignJob(worker) {
    console.log('Assigning job for ANN Project');

    if (worker.currentJob.length < worker.maxJobs && this.availableJobs.length) {
      console.log('Assigning job to ', worker.workerId);

      let newJob = this.availableJobs.shift();
      newJob.mapData = this.mapData ? this.mapData.toString() : null;
      newJob.workerId = worker.workerId;
      newJob.jobsLength = this.jobsLength;

      if (newJob) {
        worker.currentJob.push(newJob);
        worker.isBusy = true;
      }

      // Alternate timer
      if (this.timer.state() === 'clean' || this.timer.state() === 'stopped') {
        this.timer.start();
      }

      return newJob;

    } else {
      if (!this.availableJobs.length) {
        console.log('No more jobs available');

      } else {
        console.log('Error assigning job to worker');
        console.log('This worker is already at max jobs');
      }
    }

    return;
  }

  testNetwork(trainedNetwork) {
    console.log('Testing the updated neural network');
    trainedNetwork = Network.fromJSON(trainedNetwork);
    const trainer = new Trainer(trainedNetwork);
    const result = trainer.test(this.testSet, this.trainerOptions)

    return result;
  }

  updateNetwork(trainedNetwork) {
    this.network = Network.fromJSON( trainedNetwork );
    return;
  }

  resetTrainingSet() {
    // Calculate the max number of workers
    let numWorkers = 0;

    for (var key in this.workers) {
      numWorkers += this.workers[key].maxJobs;
    }
    console.log(`Max of ${numWorkers} workers`);
    this.availableJobs = this.createJobsFunc(numWorkers);
    console.log('New jobs created:', this.availableJobs.length);
    return;
  }

  completeProject(finalResult) {
    this.finalResult = finalResult;
    console.log('Project complete:', finalResult);
  }
}

module.exports = ANNProject;