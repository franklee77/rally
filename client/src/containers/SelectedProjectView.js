import React, { Component } from 'react';
import { connect } from 'react-redux';

class SelectedProjectView extends Component {
  render() {
    if (!this.props.project) {
      return <div>Select a project</div>;
    }

    return (
      <div>
        <h3>Currently Selected Project:</h3>
        <div>{this.props.project.title}</div>
      </div>
    )
  }
}

function mapStateToProps(state) {
  return {
    project: state.selectedProject
  }
}

export default connect(mapStateToProps)(SelectedProjectView);