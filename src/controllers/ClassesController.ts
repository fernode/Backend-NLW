import { Request, Response } from 'express';
import db from '../database/connection';
import convertHourToMinutes from '../utils/convertHourToMinutes';

interface ScheduleItem {
  week_day: number;
  from: string;
  to: string;
}

export default class ClassesController {
  async index(req: Request, res: Response) {
    const week_day = req.query.week_day as string;
    const subject = req.query.subject as string;
    const time = req.query.time as string;

    if (!week_day || !subject || !time) {
      return res.status(400).json({
        error: 'Missing filters search classes',
      });
    }
    const minutes = convertHourToMinutes(time);

    const classes = await db('classes')
      .whereExists(function () {
        this.select('class_schedule.*')
          .from('class_schedule')
          .whereRaw('`class_schedule`.`class_id` = `classes`.`id`')
          .whereRaw('`class_schedule`.`week_day` = ??', [Number(week_day)])
          .whereRaw('`class_schedule`.`from` <= ??', [minutes])
          .whereRaw('`class_schedule`.`to` > ??', [minutes]);
      })
      .where({
        subject,
      })
      .join('users', 'classes.user_id', '=', 'users.id')
      .select('classes.*', 'users.*');

    return res.json(classes);
  }

  async create(req: Request, res: Response) {
    const { name, avatar, whatsapp, bio, subject, cost, schedule } = req.body;
    const insertedUsersIds = await db('users').insert({
      name,
      avatar,
      whatsapp,
      bio,
    });

    const trx = await db.transaction();

    try {
      const user_id = insertedUsersIds[0];

      const insertedClassesId = await trx('classes').insert({
        subject,
        cost,
        user_id,
      });

      const class_id = insertedClassesId[0];

      const schedules = schedule.map((schedule: ScheduleItem) => {
        return {
          class_id,
          week_day: schedule.week_day,
          from: convertHourToMinutes(schedule.from),
          to: convertHourToMinutes(schedule.to),
        };
      });

      await trx('class_schedule').insert(schedules);

      await trx.commit();

      return res.status(201).send();
    } catch (error) {
      trx.rollback();

      return res
        .status(400)
        .json({ error: 'Unexpected error while creating a new class' });
    }
  }
}
