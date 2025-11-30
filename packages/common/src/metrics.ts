import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'jobqueue_' });

export const jobsSubmitted = new client.Counter({
  name: 'jobqueue_jobs_submitted_total',
  help: 'Total jobs submitted'
});

export const jobsProcessed = new client.Counter({
  name: 'jobqueue_jobs_processed_total',
  help: 'Total jobs processed (success)'
});

export const jobsFailed = new client.Counter({
  name: 'jobqueue_jobs_failed_total',
  help: 'Total job failures'
});

export const jobsDeadLetter = new client.Counter({
  name: 'jobqueue_jobs_dead_letter_total',
  help: 'Jobs moved to dead letter'
});

export const queueLengthGauge = new client.Gauge({
  name: 'jobqueue_queue_length',
  help: 'Length of ready queue'
});

export const register = client.register;
