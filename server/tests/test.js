const chai = require('chai');
const chaiHTTP = require('chai-http');
const Job = require('../constructors/Job.js');
const server = require('../server.js');
const should = chai.should();
const expect = chai.expect;
const primesOptions = require('../projects/primes.js');
const Project = require('../constructors/Project.js');
const io = require('socket.io-client');
const Worker = require('../constructors/Worker.js');

const testJob = new Job([1, 2, 3], 3, 'project01');
  it('should have a projectId', () => {
    should.exist(testJob.projectId);
    expect(testJob.projectId).to.equal('project02');
  it('should not have a result value', () => {
    should.not.exist(testJob.result);
  });
  it('should not have a mapData function', () => {
    should.not.exist(testJob.mapData);
  });
  it('should not have a workerId', () => {
    should.not.exist(testJob.workerId);
  });
  it('should not have a jobsLength', () => {
    should.not.exist(testJob.jobsLength);
  });
});

const testWorker = new Worker('project01', 'socket01');

describe('Workers', () => {
  it('should be an object', () => {
    expect(testWorker).to.be.a('object');
  });
  it('should have a project ID', () => {
    should.exist(testWorker.projectId);
  });
  it('should have a worker ID', () => {
    expect(testWorker.workerId).to.equal('socket01');
  });
});

const testProjectOptions = {
  title: 'test',
  projectType: 'testProject',
  dataSet: '',
  generateDataSet: () => { 
    return [1, 2, 3, 4] 
  },
  mapData: (data) => {
      return data * 2;
  },
  reduceResults: (results) => {
    return results.reduce( (acc, next) => {
      return acc + next;
    });
  }
};

const testProject = new Project(testProjectOptions);
const sampleJob = {
 jobId: 0,
 projectId: undefined,
 projectType: 'default',
 workerId: null,
 jobsLength: null,
 data: 1,
 result: null,
 mapData: null 
};

describe('Project', () => {
  it('should have a populated availableJobs', () => {
    expect(testProject.generateDataSet).to.exist;
    expect(testProject.availableJobs).to.exist;
    expect(testProject.availableJobs.length).to.equal(4);
    expect(testProject.availableJobs[0]).to.deep.equal(sampleJob);
  });
  it('should have an accurate jobsLength', () => {
    expect(testProject.jobsLength).to.exist;
    expect(testProject.jobsLength).to.equal(4);
  });
  it('should not have interm or final results', () => {
    expect(testProject.completedJobs).to.deep.equal([]);
    expect(testProject.finalResult).to.not.exist;
  });
});

describe('Socket Tests', () => {
  const socketURL = 'http://localhost:8000';
  const options ={
    transports: ['websocket'],
    'force new connection': true
  };

  const client1 = io(socketURL);
  expect(client1).to.exist;
});
