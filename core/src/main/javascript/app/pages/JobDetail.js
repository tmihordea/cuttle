// @flow
import React from "react";
import moment from "moment";
import { createClassFromLiteSpec } from "react-vega-lite";
import injectSheet from "react-jss";
import { markdown } from "markdown";

import mean from "lodash/mean";
import map from "lodash/map";
import flatMap from "lodash/flatMap";
import groupBy from "lodash/groupBy";
import reduce from "lodash/reduce";
import entries from "lodash/entries";

import ReactTooltip from "react-tooltip";
import TagIcon from "react-icons/lib/md/label";
import Window from "../components/Window";
import Status from "../components/Status";
import Spinner from "../components/Spinner";
import FancyTable from "../components/FancyTable";
import PopoverMenu from "../components/PopoverMenu";

import type { Job, Tag } from "../../datamodel";

type Props = {
  job: Job,
  tags: Array<Tag>, // workflow tags
  classes: typeof styles,
  closeUrl: string
};

type State = {
  data: ?(any[]),
  // job to box color map
  // job is a member of this object wiht a particular color only if it"s paused
  jobColors: ?{ [string]: string }
};

type ExecutionStat = {
  startTime: string,
  durationSeconds: number,
  waitingSeconds: number,
  status: "successful" | "failure"
};

/**
 * Unpivots execution stats to create
 * separate "run" & "wait" events aggregated
 * by date.
 */
const aggregateDataSet = (data: ExecutionStat[]) =>
  flatMap(
    entries(
      groupBy(data, d =>
        moment(d.startTime)
          .set({
            hour: 0,
            minute: 0,
            second: 0,
            millisecond: 0
          })
          .format()
      )
    ),
    ([k, v]) => [
      {
        startTime: k,
        kind: "run",
        seconds: mean(v.map(x => x.durationSeconds - x.waitingSeconds))
      },
      {
        startTime: k,
        kind: "wait",
        seconds: mean(v.map(x => x.waitingSeconds))
      }
    ]
  );

const AverageRunWaitChart = createClassFromLiteSpec("AverageRunWaitChart", {
  width: "550",
  title: "Runtime of jobs across time",
  mark: "area",
  transform: [
    {
      calculate: "datum.kind == 'run' ? 'Running' : 'Waiting'",
      as: "runningSeconds"
    }
  ],
  encoding: {
    x: {
      field: "startTime",
      type: "temporal",
      timeUnit: "utcyearmonthday",
      axis: {
        title: null,
        format: "%d/%m",
        labelAngle: -45
      }
    },
    y: {
      field: "seconds",
      type: "quantitative",
      aggregate: "sum",
      axis: {
        title: "Duration (s)"
      }
    },
    color: {
      type: "nominal",
      field: "runningSeconds",
      scale: {
        range: ["#00BCD4", "#ff9800"]
      },
      legend: { title: "Status" }
    }
  }
});

const MaxRuntimeChart = createClassFromLiteSpec("MaxRuntimeChart", {
  width: "550",
  mark: "line",
  transform: [
    {
      calculate: "datum.durationSeconds - datum.waitingSeconds",
      as: "runningSeconds"
    }
  ],
  encoding: {
    x: {
      field: "startTime",
      timeUnit: "utcyearmonthday",
      type: "temporal",
      axis: {
        title: null,
        format: "%d/%m",
        labelAngle: -45
      }
    },
    y: {
      aggregate: "max",
      type: "quantitative",
      field: "runningSeconds",
      axis: {
        title: "Max running time (s)"
      }
    }
  },
  config: {
    mark: {
      color: "#00BCD4"
    }
  }
});

const SumFailuresChart = createClassFromLiteSpec("SumFailuresChart", {
  width: "550",
  title: "Failures across time.",
  mark: "bar",
  transform: [
    { calculate: "datum.status === 'failed' ? 1 : 0", as: "failures" }
  ],
  encoding: {
    x: {
      field: "startTime",
      timeUnit: "utcyearmonthday",
      type: "temporal",
      axis: {
        format: "%d/%m",
        title: null,
        labelAngle: -45
      }
    },
    y: {
      type: "quantitative",
      aggregate: "sum",
      field: "failures",
      axis: {
        title: "Number of failures"
      }
    }
  },
  config: {
    mark: {
      color: "#e91e63"
    }
  }
});

class JobDetail extends React.Component {
  props: Props;
  state: State;

  constructor(props) {
    super(props);

    this.updateCharts(props.job.id);
    this.updatePausedJobs();

    this.state = {
      data: undefined,
      jobColors: undefined
    };
  }

  componentWillReceiveProps(nextProps: Props) {
    if (nextProps && nextProps.job && nextProps.job !== this.props.job) {
      this.setState({
        data: undefined
      });
      this.updateCharts(nextProps.job.id);
    }
  }

  updateCharts(jobId: string) {
    fetch(`/api/statistics/${jobId}`)
      .then(data => data.json())
      .then(json => {
        this.setState({
          data: json
        });
      });
  }

  updatePausedJobs() {
    fetch(`/api/jobs/paused`)
      .then(data => data.json())
      .then(json => {
        this.setState({
          jobColors: json.reduce(
            (acc, job) => Object.assign(acc, { [job]: "#FFAAFF" }),
            {}
          )
        });
      });
  }

  render() {
    const {
      job: { id, name, tags, description, scheduling },
      classes,
      tags: workflowTags,
      closeUrl
    } = this.props;

    const { data } = this.state;

    const tagsDictionnary = reduce(
      workflowTags,
      (acc, current) => ({
        ...acc,
        [current.name]: current
      }),
      {}
    );

    const renderTimeSeriesSechduling = () => [
      scheduling.calendar && [
        <dt key="period">Period:</dt>,
        <dd key="period_">{scheduling.calendar.period}</dd>
      ],
      scheduling.start && [
        <dt key="start">Start Date:</dt>,
        <dd key="start_">{scheduling.start}</dd>
      ],
      scheduling.maxPeriods != 1 && [
        <dt key="maxPeriods">Max Periods:</dt>,
        <dd key="maxPeriods_">{scheduling.maxPeriods}</dd>
      ]
    ];

    const charts = (data: any) => {
      if (data) {
        return (
          <div className={classes.charts}>
            <div className={classes.chartSection}>
              <h3>Average run/wait times over last 30 days</h3>
              <AverageRunWaitChart
                className="chart"
                data={{ values: aggregateDataSet(data) }}
              />
            </div>
            <div className={classes.chartSection}>
              <h3>Max runtime over last 30 days</h3>
              <MaxRuntimeChart className="chart" data={{ values: data }} />
            </div>
            <div className={classes.chartSection}>
              <h3>Number of failures over last 30 days</h3>
              <SumFailuresChart className="chart" data={{ values: data }} />
            </div>
          </div>
        );
      }
      return (
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "inline-block", marginTop: "50px" }}>
            <Spinner />
          </div>
        </div>
      );
    };

    const JobMenu = ({ job }: { job: string }) => {
      const menuItems =
        this.state.jobColors && this.state.jobColors[job]
          ? [
              <span
                onClick={() =>
                  fetch(`/api/jobs/resume?jobs=${job}`, {
                    method: "POST",
                    credentials: "include"
                  }).then(() => this.updatePausedJobs(job))
                }
              >
                Resume
              </span>
            ]
          : [
              <span
                onClick={() =>
                  fetch(`/api/jobs/pause?jobs=${job}`, {
                    method: "POST",
                    credentials: "include"
                  }).then(() => this.updatePausedJobs(job))
                }
              >
                Pause
              </span>
            ];

      return <PopoverMenu className={classes.menu} items={menuItems} />;
    };
    return (
      <Window closeUrl={closeUrl} title="Job details">
        <div className={classes.jobCard}>
          <JobMenu job={id} />
          <FancyTable>
            <dt key="id">Id:</dt>
            <dd key="id_">{id}</dd>
            <dt key="name">Name:</dt>
            <dd key="name_">{name}</dd>
            {renderTimeSeriesSechduling()}
            {tags.length > 0 && [
              <dt key="tags">Tags:</dt>,
              <dd key="tags_" className={classes.tags}>
                {map(tags, t => [
                  <span
                    key={tagsDictionnary[t].name}
                    className={classes.tag}
                    data-for={"tag" + tagsDictionnary[t].name}
                    data-tip={tagsDictionnary[t].description}
                  >
                    <TagIcon className="tagIcon" />
                    {tagsDictionnary[t].name}
                  </span>,
                  <ReactTooltip
                    id={"tag" + tagsDictionnary[t].name}
                    effect="float"
                  />
                ])}
              </dd>
            ]}
            {description && [
              <dt key="description">Description:</dt>,
              <dd
                key="description_"
                className={classes.description}
                dangerouslySetInnerHTML={{
                  __html: markdown.toHTML(description)
                }}
              />
            ]}
            {this.state.jobColors &&
              this.state.jobColors[id] && [
                <dt key="status">Status:</dt>,
                <dd key="status_">
                  <Status status="paused" />
                </dd>
              ]}
          </FancyTable>
        </div>
        {charts(data)}
      </Window>
    );
  }
}

const styles = {
  charts: {
    overflow: "auto",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-around"
  },
  chartSection: {
    "& > .chart": {
      marginLeft: "50px",
      marginBottom: "50px"
    },
    "& h3": {
      color: "#3B4254",
      textAlign: "center",
      fontSize: "1em"
    }
  },
  tags: {
    display: "table-cell"
  },
  tag: {
    cursor: "help",
    verticalAlign: "middle",
    border: "1px solid #999",
    margin: "0 0.2em",
    padding: "0.2em 0.4em",
    borderRadius: "0.2em",
    "& .tagIcon": {
      marginRight: "0.4em",
      fontSize: "1.2em"
    }
  },
  description: {
    lineHeight: "1.25em !important",
    fontSize: "0.95em",
    textAlign: "justify !important",
    overflowY: "scroll"
  },
  jobCard: {
    color: "#3B4254",
    position: "relative"
  },
  menu: {
    position: "absolute",
    top: "10px",
    right: "1em"
  }
};

export default injectSheet(styles)(JobDetail);
