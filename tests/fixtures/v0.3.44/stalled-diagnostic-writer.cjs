// Isolated fault fixture: acknowledge startup, then deliberately stop draining events.
process.on('message', message => {
  if (message.type === 'init') process.send({ id: message.id, ok: true, summary: { status: 'running', writerFailed: false } });
  if (message.type === 'close') process.send({ id: message.id, ok: true }, () => process.exit(0));
});
process.on('disconnect', () => process.exit(0));
