const toMood = (event: string, _content: unknown) => {
    if (event === 'push') {
        return
    }
    if (event === 'pull_request.opened') {
        return
    }
    if (event === 'pull_request.review_requested') {
        return
    }
    if (event === 'pull_request.closed') {
        return
    }
    if (event === 'workflow_run.completed') {
        return
    }
}

export default toMood