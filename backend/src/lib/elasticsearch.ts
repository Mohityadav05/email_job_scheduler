import { Client } from "@elastic/elasticsearch";
import { config } from "../config";

const es = new Client({ node: config.ELASTICSEARCH_URL });

export default es;
