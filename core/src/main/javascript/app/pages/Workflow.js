// @flow

import React from "react";
import injectSheet from "react-jss";

import filter from "lodash/filter";
import find from "lodash/find";
import includes from "lodash/includes";
import map from "lodash/map";
import some from "lodash/some";

import type { Edge, Node } from "../../graph/dagger/dataAPI/genericGraph";
import type { Dependency, Job, Workflow } from "../../datamodel";

import Select from "react-select";
import { navigate } from "redux-url";
import { connect } from "react-redux";
import ReactTooltip from "react-tooltip";

import MdList from "react-icons/lib/md/list";
import Dagger from "../../graph/Dagger";
import Link from "../components/Link";

import JobDetail from "./JobDetail";

type Props = {
  classes: any,
  workflow: Workflow,
  selectedJobs: string[],
  job: string,
  navTo: () => void,
  showDetail: boolean,
  refPath?: string
};

class WorkflowComponent extends React.Component {
  props: Props;

  render() {
    const {
      classes,
      workflow = {},
      job,
      selectedJobs = [],
      navTo,
      showDetail,
      refPath
    } = this.props;
    const filteredJobs = filter(workflow.jobs, j =>
      includes(selectedJobs, j.id)
    );
    const jobs = filteredJobs.length > 0 ? filteredJobs : workflow.jobs;
    const nodes: Node[] = map(jobs, (j: Job, i) => ({
      ...j,
      order: i,
      yPosition: i
    }));

    const filteredEdges = filter(
      workflow.dependencies,
      e => some(jobs, { id: e.from }) && some(jobs, { id: e.to })
    );
    const edges: Edge[] = map(filteredEdges, (d: Dependency) => ({
      id: d.from + d.to,
      source: d.from,
      target: d.to,
      value: 1
    }));

    const startNode = find(jobs, { id: job }) || jobs[0];

    ReactTooltip.rebuild();

    return (
      <div className={classes.main}>
        <Dagger
          nodes={nodes}
          edges={edges}
          startNodeId={startNode.id}
          onClickNode={id => navTo("/workflow/" + id)}
        />
        <div className={classes.controller}>
          <Select
            className={classes.jobSelector}
            name="jobSelector"
            options={map(nodes, n => ({ value: n.id, label: n.name }))}
            onChange={o => navTo("/workflow/" + o.value)}
            value={startNode.id}
            clearable={false}
          />
          <Link
            className={classes.detailIcon}
            title="Job details"
            href={`/workflow/${startNode.id}?showDetail=true`}
          >
            <MdList />
          </Link>
        </div>
        {showDetail && (
          <JobDetail
            job={startNode}
            tags={workflow.tags}
            closeUrl={refPath || `/workflow/${startNode.id}`}
          />
        )}
      </div>
    );
  }
}

const styles = {
  main: {
    backgroundColor: "#ECF1F5",
    flex: 1,
    width: "100%",
    height: "calc(100vh - 4em)",
    position: "relative"
  },
  controller: {
    position: "absolute",
    top: "2em",
    display: "flex",
    justifyContent: "center",
    width: "100%"
  },
  detailIcon: {
    fontSize: "30px",
    color: "#607e96",
    marginLeft: ".25em",
    cursor: "pointer"
  },
  jobSelector: {
    width: "600px",
    "& .Select-control": {
      height: "1em",
      backgroundColor: "#F5F8FA",
      "& .Select-value": {
        color: "#A9B8C3",
        fontSize: "0.9em"
      },
      "& .Select-menu ! important": {
        margin: "0 1em",
        width: "calc(600px - 2em)"
      },
      "& .Select-menu-outer !important": {
        margin: "0 1em",
        width: "calc(600px - 2em)"
      },
      "& .Select-option !important": {
        fontSize: "0.9em"
      },
      "& .Select-arrow-zone": {
        display: "none"
      }
    }
  }
};

const mapStateToProps = ({ app: { page: { showDetail, refPath } } }) => ({
  showDetail,
  refPath
});

export default connect(mapStateToProps, dispatch => ({
  navTo: link => dispatch(navigate(link))
}))(injectSheet(styles)(WorkflowComponent));
